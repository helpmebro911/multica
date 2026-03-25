package events

import (
	"sync/atomic"
	"testing"
)

func TestPublishDeliversToSubscribers(t *testing.T) {
	bus := New()
	var count int32

	bus.Subscribe("test:event", func(e Event) {
		atomic.AddInt32(&count, 1)
	})
	bus.Subscribe("test:event", func(e Event) {
		atomic.AddInt32(&count, 1)
	})

	bus.Publish(Event{Type: "test:event", Payload: "hello"})

	if count != 2 {
		t.Errorf("expected 2 handlers called, got %d", count)
	}
}

func TestPublishOnlyMatchingType(t *testing.T) {
	bus := New()
	var called bool

	bus.Subscribe("type:a", func(e Event) {
		called = true
	})

	bus.Publish(Event{Type: "type:b"})

	if called {
		t.Error("handler for type:a should not be called for type:b event")
	}
}

func TestPublishNoSubscribersIsNoop(t *testing.T) {
	bus := New()
	// Should not panic
	bus.Publish(Event{Type: "no:listeners"})
}

func TestPanicInHandlerDoesNotBreakOthers(t *testing.T) {
	bus := New()
	var secondCalled bool

	bus.Subscribe("test:panic", func(e Event) {
		panic("handler panic")
	})
	bus.Subscribe("test:panic", func(e Event) {
		secondCalled = true
	})

	bus.Publish(Event{Type: "test:panic"})

	if !secondCalled {
		t.Error("second handler should still be called after first panics")
	}
}

func TestEventFieldsPassedThrough(t *testing.T) {
	bus := New()
	var received Event

	bus.Subscribe("test:fields", func(e Event) {
		received = e
	})

	bus.Publish(Event{
		Type:        "test:fields",
		WorkspaceID: "ws-123",
		ActorType:   "member",
		ActorID:     "user-456",
		Payload:     map[string]string{"key": "value"},
	})

	if received.WorkspaceID != "ws-123" {
		t.Errorf("expected WorkspaceID ws-123, got %s", received.WorkspaceID)
	}
	if received.ActorType != "member" {
		t.Errorf("expected ActorType member, got %s", received.ActorType)
	}
	if received.ActorID != "user-456" {
		t.Errorf("expected ActorID user-456, got %s", received.ActorID)
	}
}
