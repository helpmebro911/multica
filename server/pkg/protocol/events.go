package protocol

// Event types for WebSocket communication between server, web clients, and daemon.
const (
	// Issue events
	EventIssueCreated = "issue:created"
	EventIssueUpdated = "issue:updated"
	EventIssueDeleted = "issue:deleted"

	// Comment events
	EventCommentCreated = "comment:created"
	EventCommentUpdated = "comment:updated"
	EventCommentDeleted = "comment:deleted"

	// Agent events
	EventAgentStatus  = "agent:status"
	EventAgentCreated = "agent:created"
	EventAgentDeleted = "agent:deleted"

	// Task events (server <-> daemon)
	EventTaskDispatch  = "task:dispatch"
	EventTaskProgress  = "task:progress"
	EventTaskCompleted = "task:completed"
	EventTaskFailed    = "task:failed"

	// Inbox events
	EventInboxNew      = "inbox:new"
	EventInboxRead     = "inbox:read"
	EventInboxArchived = "inbox:archived"

	// Workspace events
	EventWorkspaceUpdated = "workspace:updated"
	EventWorkspaceDeleted = "workspace:deleted"

	// Member events
	EventMemberAdded   = "member:added"
	EventMemberUpdated = "member:updated"
	EventMemberRemoved = "member:removed"

	// Daemon events
	EventDaemonHeartbeat = "daemon:heartbeat"
	EventDaemonRegister  = "daemon:register"
)
