import EventEmitter from "events";

// Simple in-process event bus for workflow ↔ HTTP communication.
// In a multi-process setup this would be replaced with Redis pub/sub
// or Resonate's own promise resolution API.
export const bus = new EventEmitter();
bus.setMaxListeners(100);
