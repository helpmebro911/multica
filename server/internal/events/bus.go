package events

import (
	"log"
	"sync"
)

// Event represents a domain event published by handlers or services.
type Event struct {
	Type        string // e.g. "issue:created", "inbox:new"
	WorkspaceID string // routes to correct Hub room
	ActorType   string // "member", "agent", or "system"
	ActorID     string
	Payload     any // JSON-serializable, same shape as current WS payloads
}

// Handler is a function that processes an event.
type Handler func(Event)

// Bus is an in-process synchronous pub/sub event bus.
type Bus struct {
	mu        sync.RWMutex
	listeners map[string][]Handler
}

// New creates a new event bus.
func New() *Bus {
	return &Bus{
		listeners: make(map[string][]Handler),
	}
}

// Subscribe registers a handler for a given event type.
// Handlers are called synchronously in registration order.
func (b *Bus) Subscribe(eventType string, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.listeners[eventType] = append(b.listeners[eventType], h)
}

// Publish dispatches an event to all registered handlers for that event type.
// Each handler is called synchronously. Panics in individual handlers are
// recovered so one failing handler does not prevent others from executing.
func (b *Bus) Publish(e Event) {
	b.mu.RLock()
	handlers := b.listeners[e.Type]
	b.mu.RUnlock()

	for _, h := range handlers {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[event-bus] panic in listener for %q: %v", e.Type, r)
				}
			}()
			h(e)
		}()
	}
}
