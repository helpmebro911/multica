package main

import (
	"encoding/json"
	"log"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/realtime"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// registerListeners wires up event bus listeners for WS broadcasting.
func registerListeners(bus *events.Bus, hub *realtime.Hub) {
	allEvents := []string{
		protocol.EventIssueCreated,
		protocol.EventIssueUpdated,
		protocol.EventIssueDeleted,
		protocol.EventCommentCreated,
		protocol.EventCommentUpdated,
		protocol.EventCommentDeleted,
		protocol.EventAgentStatus,
		protocol.EventAgentCreated,
		protocol.EventAgentDeleted,
		protocol.EventTaskDispatch,
		protocol.EventTaskProgress,
		protocol.EventTaskCompleted,
		protocol.EventTaskFailed,
		protocol.EventInboxNew,
		protocol.EventInboxRead,
		protocol.EventInboxArchived,
		protocol.EventWorkspaceUpdated,
		protocol.EventWorkspaceDeleted,
		protocol.EventMemberAdded,
		protocol.EventMemberUpdated,
		protocol.EventMemberRemoved,
	}

	for _, et := range allEvents {
		eventType := et
		bus.Subscribe(eventType, func(e events.Event) {
			msg := map[string]any{
				"type":    eventType,
				"payload": e.Payload,
			}
			data, err := json.Marshal(msg)
			if err != nil {
				log.Printf("[listeners] failed to marshal %s event: %v", eventType, err)
				return
			}
			if e.WorkspaceID != "" {
				hub.BroadcastToWorkspace(e.WorkspaceID, data)
			} else {
				hub.Broadcast(data)
			}
		})
	}
}
