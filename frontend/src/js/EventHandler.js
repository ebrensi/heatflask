/**
 * This is a tiny Event Handler class that enables your code to generate
 * events and let others add listeners
 *
 * Efrem Rensi 2020
 */

export class EventHandler {
  constructor() {
    this.eventListeners = {}
  }

  /**
   * Let other code listen for an event.
   * @param {String}   event    the event name
   */
  addListener(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event].push(callback)
    console.log(this.eventListeners)
  }

  /**
   * Generate an event
   * @param  {String} event   then event name
   * @param  {} payload the data that you will pass to the listener
   */
  emit(event, payload) {
    if (event in this.eventListeners) {
      for (const func of this.eventListeners[event]) {
        func(payload)
      }
    }
  }
}
