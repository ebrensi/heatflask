/**
 * A tiny Event Handler class that enables your code to generate
 * events and let others add listeners
 *
 * Efrem Rensi 2020
 */
type EventCallback = (x: unknown) => void

export class EventHandler {
  eventListeners: Map<string, EventCallback[]>

  constructor() {
    this.eventListeners = new Map()
  }

  /**
   * Let other code listen for an event.
   * @param {String}   event    the event name
   */
  addListener(event: string, callback: EventCallback): void {
    let eventCallbacks: EventCallback[]

    if (!this.eventListeners.has(event)) {
      eventCallbacks = []
      this.eventListeners.set(event, eventCallbacks)
    } else {
      eventCallbacks = this.eventListeners.get(event)
    }
    eventCallbacks.push(callback)
    console.log(this.eventListeners)
  }

  /**
   * Generate an event
   * @param  {String} event   then event name
   * @param  {} payload the data that you will pass to the listener
   */
  emit(event: string, payload: unknown): void {
    if (!this.eventListeners.has(event)) return
    for (const func of this.eventListeners[event]) func(payload)
  }
}
