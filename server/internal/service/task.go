package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/realtime"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type TaskService struct {
	Queries *db.Queries
	Hub     *realtime.Hub
	Bus     *events.Bus
}

func NewTaskService(q *db.Queries, hub *realtime.Hub, bus *events.Bus) *TaskService {
	return &TaskService{Queries: q, Hub: hub, Bus: bus}
}

// EnqueueTaskForIssue creates a task with a context snapshot of the issue.
func (s *TaskService) EnqueueTaskForIssue(ctx context.Context, issue db.Issue) (db.AgentTaskQueue, error) {
	if !issue.AssigneeID.Valid {
		return db.AgentTaskQueue{}, fmt.Errorf("issue has no assignee")
	}

	agent, err := s.Queries.GetAgent(ctx, issue.AssigneeID)
	if err != nil {
		return db.AgentTaskQueue{}, fmt.Errorf("load agent: %w", err)
	}
	if !agent.RuntimeID.Valid {
		return db.AgentTaskQueue{}, fmt.Errorf("agent has no runtime")
	}

	runtime, err := s.Queries.GetAgentRuntime(ctx, agent.RuntimeID)
	if err != nil {
		return db.AgentTaskQueue{}, fmt.Errorf("load runtime: %w", err)
	}

	// Include workspace context in the snapshot when available.
	var workspaceContext string
	if ws, err := s.Queries.GetWorkspace(ctx, issue.WorkspaceID); err == nil && ws.Context.Valid {
		workspaceContext = ws.Context.String
	}

	// Load agent's structured skills + files.
	agentSkills := s.loadAgentSkillsForSnapshot(ctx, agent.ID)

	snapshot := buildContextSnapshot(issue, agent, runtime, workspaceContext, agentSkills)
	contextJSON, _ := json.Marshal(snapshot)

	task, err := s.Queries.CreateAgentTaskWithContext(ctx, db.CreateAgentTaskWithContextParams{
		AgentID:   issue.AssigneeID,
		RuntimeID: agent.RuntimeID,
		IssueID:   issue.ID,
		Priority:  priorityToInt(issue.Priority),
		Context:   contextJSON,
	})
	if err != nil {
		return db.AgentTaskQueue{}, fmt.Errorf("create task: %w", err)
	}

	return task, nil
}

// CancelTasksForIssue cancels all active tasks for an issue.
func (s *TaskService) CancelTasksForIssue(ctx context.Context, issueID pgtype.UUID) error {
	return s.Queries.CancelAgentTasksByIssue(ctx, issueID)
}

// ClaimTask atomically claims the next queued task for an agent,
// respecting max_concurrent_tasks.
func (s *TaskService) ClaimTask(ctx context.Context, agentID pgtype.UUID) (*db.AgentTaskQueue, error) {
	agent, err := s.Queries.GetAgent(ctx, agentID)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}

	running, err := s.Queries.CountRunningTasks(ctx, agentID)
	if err != nil {
		return nil, fmt.Errorf("count running tasks: %w", err)
	}
	if running >= int64(agent.MaxConcurrentTasks) {
		return nil, nil // No capacity
	}

	task, err := s.Queries.ClaimAgentTask(ctx, agentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // No tasks available
		}
		return nil, fmt.Errorf("claim task: %w", err)
	}

	// Update agent status to working
	s.updateAgentStatus(ctx, agentID, "working")

	// Broadcast task:dispatch
	s.broadcastTaskDispatch(ctx, task)

	return &task, nil
}

// ClaimTaskForRuntime claims the next runnable task for a runtime while
// still respecting each agent's max_concurrent_tasks limit.
func (s *TaskService) ClaimTaskForRuntime(ctx context.Context, runtimeID pgtype.UUID) (*db.AgentTaskQueue, error) {
	tasks, err := s.Queries.ListPendingTasksByRuntime(ctx, runtimeID)
	if err != nil {
		return nil, fmt.Errorf("list pending tasks: %w", err)
	}

	triedAgents := map[string]struct{}{}
	for _, candidate := range tasks {
		agentKey := util.UUIDToString(candidate.AgentID)
		if _, seen := triedAgents[agentKey]; seen {
			continue
		}
		triedAgents[agentKey] = struct{}{}

		task, err := s.ClaimTask(ctx, candidate.AgentID)
		if err != nil {
			return nil, err
		}
		if task != nil && task.RuntimeID == runtimeID {
			return task, nil
		}
	}

	return nil, nil
}

// StartTask transitions a dispatched task to running and syncs issue status.
func (s *TaskService) StartTask(ctx context.Context, taskID pgtype.UUID) (*db.AgentTaskQueue, error) {
	task, err := s.Queries.StartAgentTask(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("start task: %w", err)
	}

	// Sync issue → in_progress
	issue, err := s.Queries.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:     task.IssueID,
		Status: "in_progress",
	})
	if err == nil {
		s.broadcastIssueUpdated(issue)
	}

	return &task, nil
}

// CompleteTask marks a task as completed and syncs issue/agent status.
func (s *TaskService) CompleteTask(ctx context.Context, taskID pgtype.UUID, result []byte) (*db.AgentTaskQueue, error) {
	task, err := s.Queries.CompleteAgentTask(ctx, db.CompleteAgentTaskParams{
		ID:     taskID,
		Result: result,
	})
	if err != nil {
		return nil, fmt.Errorf("complete task: %w", err)
	}

	// Sync issue → in_review
	issue, issueErr := s.Queries.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:     task.IssueID,
		Status: "in_review",
	})
	if issueErr == nil {
		s.broadcastIssueUpdated(issue)
	}

	var payload protocol.TaskCompletedPayload
	if err := json.Unmarshal(result, &payload); err == nil {
		if payload.Output != "" {
			s.createAgentComment(ctx, task.IssueID, task.AgentID, payload.Output, "comment")
		}
	}

	if issueErr == nil {
		s.createInboxForIssueCreator(ctx, issue, "review_requested", "attention", "Review requested: "+issue.Title, "")
	}

	// Reconcile agent status
	s.ReconcileAgentStatus(ctx, task.AgentID)

	// Broadcast
	s.broadcastTaskEvent(ctx, protocol.EventTaskCompleted, task)

	return &task, nil
}

// FailTask marks a task as failed and syncs issue/agent status.
func (s *TaskService) FailTask(ctx context.Context, taskID pgtype.UUID, errMsg string) (*db.AgentTaskQueue, error) {
	task, err := s.Queries.FailAgentTask(ctx, db.FailAgentTaskParams{
		ID:    taskID,
		Error: pgtype.Text{String: errMsg, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("fail task: %w", err)
	}

	// Sync issue → blocked
	issue, issueErr := s.Queries.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:     task.IssueID,
		Status: "blocked",
	})
	if issueErr == nil {
		s.broadcastIssueUpdated(issue)
	}
	if errMsg != "" {
		s.createAgentComment(ctx, task.IssueID, task.AgentID, errMsg, "system")
	}
	if issueErr == nil {
		s.createInboxForIssueCreator(ctx, issue, "agent_blocked", "action_required", "Agent blocked: "+issue.Title, errMsg)
	}

	// Reconcile agent status
	s.ReconcileAgentStatus(ctx, task.AgentID)

	// Broadcast
	s.broadcastTaskEvent(ctx, protocol.EventTaskFailed, task)

	return &task, nil
}

// ReportProgress broadcasts a progress update via the event bus.
func (s *TaskService) ReportProgress(ctx context.Context, taskID string, workspaceID string, summary string, step, total int) {
	s.Bus.Publish(events.Event{
		Type:        protocol.EventTaskProgress,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		ActorID:     "",
		Payload: protocol.TaskProgressPayload{
			TaskID:  taskID,
			Summary: summary,
			Step:    step,
			Total:   total,
		},
	})
}

// ReconcileAgentStatus checks running task count and sets agent status accordingly.
func (s *TaskService) ReconcileAgentStatus(ctx context.Context, agentID pgtype.UUID) {
	running, err := s.Queries.CountRunningTasks(ctx, agentID)
	if err != nil {
		return
	}
	newStatus := "idle"
	if running > 0 {
		newStatus = "working"
	}
	s.updateAgentStatus(ctx, agentID, newStatus)
}

func (s *TaskService) updateAgentStatus(ctx context.Context, agentID pgtype.UUID, status string) {
	agent, err := s.Queries.UpdateAgentStatus(ctx, db.UpdateAgentStatusParams{
		ID:     agentID,
		Status: status,
	})
	if err != nil {
		return
	}
	s.Bus.Publish(events.Event{
		Type:        protocol.EventAgentStatus,
		WorkspaceID: util.UUIDToString(agent.WorkspaceID),
		ActorType:   "system",
		ActorID:     "",
		Payload:     map[string]any{"agent": agentToMap(agent)},
	})
}

type skillSnapshot struct {
	Name    string             `json:"name"`
	Content string             `json:"content"`
	Files   []skillFileSnapshot `json:"files,omitempty"`
}

type skillFileSnapshot struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (s *TaskService) loadAgentSkillsForSnapshot(ctx context.Context, agentID pgtype.UUID) []skillSnapshot {
	skills, err := s.Queries.ListAgentSkills(ctx, agentID)
	if err != nil || len(skills) == 0 {
		return nil
	}

	result := make([]skillSnapshot, 0, len(skills))
	for _, sk := range skills {
		snap := skillSnapshot{Name: sk.Name, Content: sk.Content}
		files, _ := s.Queries.ListSkillFiles(ctx, sk.ID)
		for _, f := range files {
			snap.Files = append(snap.Files, skillFileSnapshot{Path: f.Path, Content: f.Content})
		}
		result = append(result, snap)
	}
	return result
}

func buildContextSnapshot(issue db.Issue, agent db.Agent, runtime db.AgentRuntime, workspaceContext string, skills []skillSnapshot) map[string]any {
	var ac []string
	if issue.AcceptanceCriteria != nil {
		json.Unmarshal(issue.AcceptanceCriteria, &ac)
	}
	var cr []string
	if issue.ContextRefs != nil {
		json.Unmarshal(issue.ContextRefs, &cr)
	}
	var tools any
	if agent.Tools != nil {
		json.Unmarshal(agent.Tools, &tools)
	}
	var metadata any
	if runtime.Metadata != nil {
		json.Unmarshal(runtime.Metadata, &metadata)
	}

	m := map[string]any{
		"issue": map[string]any{
			"id":                  util.UUIDToString(issue.ID),
			"title":               issue.Title,
			"description":         issue.Description.String,
			"acceptance_criteria": ac,
			"context_refs":        cr,
		},
		"agent": map[string]any{
			"id":     util.UUIDToString(agent.ID),
			"name":   agent.Name,
			"skills": skills,
			"tools":  tools,
		},
		"runtime": map[string]any{
			"id":           util.UUIDToString(runtime.ID),
			"name":         runtime.Name,
			"runtime_mode": runtime.RuntimeMode,
			"provider":     runtime.Provider,
			"device_info":  runtime.DeviceInfo,
			"metadata":     metadata,
		},
	}
	if workspaceContext != "" {
		m["workspace_context"] = workspaceContext
	}
	return m
}

func priorityToInt(p string) int32 {
	switch p {
	case "urgent":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	default:
		return 0
	}
}

func (s *TaskService) broadcastTaskDispatch(ctx context.Context, task db.AgentTaskQueue) {
	var payload map[string]any
	if task.Context != nil {
		json.Unmarshal(task.Context, &payload)
	}
	if payload == nil {
		payload = map[string]any{}
	}
	payload["task_id"] = util.UUIDToString(task.ID)
	payload["runtime_id"] = util.UUIDToString(task.RuntimeID)

	workspaceID := ""
	if issue, err := s.Queries.GetIssue(ctx, task.IssueID); err == nil {
		workspaceID = util.UUIDToString(issue.WorkspaceID)
	}
	s.Bus.Publish(events.Event{
		Type:        protocol.EventTaskDispatch,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		ActorID:     "",
		Payload:     payload,
	})
}

func (s *TaskService) broadcastTaskEvent(ctx context.Context, eventType string, task db.AgentTaskQueue) {
	workspaceID := ""
	if issue, err := s.Queries.GetIssue(ctx, task.IssueID); err == nil {
		workspaceID = util.UUIDToString(issue.WorkspaceID)
	}
	s.Bus.Publish(events.Event{
		Type:        eventType,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		ActorID:     "",
		Payload: map[string]any{
			"task_id":  util.UUIDToString(task.ID),
			"agent_id": util.UUIDToString(task.AgentID),
			"issue_id": util.UUIDToString(task.IssueID),
			"status":   task.Status,
		},
	})
}

func (s *TaskService) broadcastIssueUpdated(issue db.Issue) {
	s.Bus.Publish(events.Event{
		Type:        protocol.EventIssueUpdated,
		WorkspaceID: util.UUIDToString(issue.WorkspaceID),
		ActorType:   "system",
		ActorID:     "",
		Payload:     map[string]any{"issue": issueToMap(issue)},
	})
}

func (s *TaskService) createAgentComment(ctx context.Context, issueID, agentID pgtype.UUID, content, commentType string) {
	if content == "" {
		return
	}
	comment, err := s.Queries.CreateComment(ctx, db.CreateCommentParams{
		IssueID:    issueID,
		AuthorType: "agent",
		AuthorID:   agentID,
		Content:    content,
		Type:       commentType,
	})
	if err != nil {
		return
	}
	// Look up issue to get workspace ID for broadcasting
	issue, err := s.Queries.GetIssue(ctx, issueID)
	if err != nil {
		return
	}
	s.Bus.Publish(events.Event{
		Type:        protocol.EventCommentCreated,
		WorkspaceID: util.UUIDToString(issue.WorkspaceID),
		ActorType:   "agent",
		ActorID:     util.UUIDToString(agentID),
		Payload: map[string]any{
			"comment": map[string]any{
				"id":          util.UUIDToString(comment.ID),
				"issue_id":    util.UUIDToString(comment.IssueID),
				"author_type": comment.AuthorType,
				"author_id":   util.UUIDToString(comment.AuthorID),
				"content":     comment.Content,
				"type":        comment.Type,
				"created_at":  comment.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
			},
		},
	})
}

func (s *TaskService) createInboxForIssueCreator(ctx context.Context, issue db.Issue, itemType, severity, title, body string) {
	if issue.CreatorType != "member" {
		return
	}
	item, err := s.Queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
		WorkspaceID:   issue.WorkspaceID,
		RecipientType: "member",
		RecipientID:   issue.CreatorID,
		Type:          itemType,
		Severity:      severity,
		IssueID:       issue.ID,
		Title:         title,
		Body:          util.PtrToText(&body),
	})
	if err != nil {
		return
	}
	s.Bus.Publish(events.Event{
		Type:        protocol.EventInboxNew,
		WorkspaceID: util.UUIDToString(issue.WorkspaceID),
		ActorType:   "system",
		ActorID:     "",
		Payload:     map[string]any{"item": inboxToMap(item)},
	})
}

func issueToMap(issue db.Issue) map[string]any {
	var ac []any
	if issue.AcceptanceCriteria != nil {
		json.Unmarshal(issue.AcceptanceCriteria, &ac)
	}
	if ac == nil {
		ac = []any{}
	}

	var cr []any
	if issue.ContextRefs != nil {
		json.Unmarshal(issue.ContextRefs, &cr)
	}
	if cr == nil {
		cr = []any{}
	}

	return map[string]any{
		"id":                  util.UUIDToString(issue.ID),
		"workspace_id":        util.UUIDToString(issue.WorkspaceID),
		"title":               issue.Title,
		"description":         util.TextToPtr(issue.Description),
		"status":              issue.Status,
		"priority":            issue.Priority,
		"assignee_type":       util.TextToPtr(issue.AssigneeType),
		"assignee_id":         util.UUIDToPtr(issue.AssigneeID),
		"creator_type":        issue.CreatorType,
		"creator_id":          util.UUIDToString(issue.CreatorID),
		"parent_issue_id":     util.UUIDToPtr(issue.ParentIssueID),
		"acceptance_criteria": ac,
		"context_refs":        cr,
		"position":            issue.Position,
		"due_date":            util.TimestampToPtr(issue.DueDate),
		"created_at":          util.TimestampToString(issue.CreatedAt),
		"updated_at":          util.TimestampToString(issue.UpdatedAt),
	}
}

func inboxToMap(item db.InboxItem) map[string]any {
	return map[string]any{
		"id":             util.UUIDToString(item.ID),
		"workspace_id":   util.UUIDToString(item.WorkspaceID),
		"recipient_type": item.RecipientType,
		"recipient_id":   util.UUIDToString(item.RecipientID),
		"type":           item.Type,
		"severity":       item.Severity,
		"issue_id":       util.UUIDToPtr(item.IssueID),
		"title":          item.Title,
		"body":           util.TextToPtr(item.Body),
		"read":           item.Read,
		"archived":       item.Archived,
		"created_at":     util.TimestampToString(item.CreatedAt),
	}
}

// agentToMap builds a simple map for broadcasting agent status updates.
func agentToMap(a db.Agent) map[string]any {
	var rc any
	if a.RuntimeConfig != nil {
		json.Unmarshal(a.RuntimeConfig, &rc)
	}
	var tools any
	if a.Tools != nil {
		json.Unmarshal(a.Tools, &tools)
	}
	var triggers any
	if a.Triggers != nil {
		json.Unmarshal(a.Triggers, &triggers)
	}
	return map[string]any{
		"id":                   util.UUIDToString(a.ID),
		"workspace_id":         util.UUIDToString(a.WorkspaceID),
		"runtime_id":           util.UUIDToString(a.RuntimeID),
		"name":                 a.Name,
		"description":          a.Description,
		"avatar_url":           util.TextToPtr(a.AvatarUrl),
		"runtime_mode":         a.RuntimeMode,
		"runtime_config":       rc,
		"visibility":           a.Visibility,
		"status":               a.Status,
		"max_concurrent_tasks": a.MaxConcurrentTasks,
		"owner_id":             util.UUIDToPtr(a.OwnerID),
		"skills":               []any{},
		"tools":                tools,
		"triggers":             triggers,
		"created_at":           util.TimestampToString(a.CreatedAt),
		"updated_at":           util.TimestampToString(a.UpdatedAt),
	}
}
