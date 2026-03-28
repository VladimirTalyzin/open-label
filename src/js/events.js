export function addEventListenerWithId(element, eventType, listenerId, listenerFunction)
{
    if (!element.saved_event_listeners)
    {
        element.saved_event_listeners = {}
    }

    if (element.saved_event_listeners[listenerId])
    {
        const {event_type: prevEventType, listener_function: prevListenerFunction} =
            element.saved_event_listeners[listenerId]
        element.removeEventListener(prevEventType, prevListenerFunction)
    }

    element.addEventListener(eventType, listenerFunction)
    element.saved_event_listeners[listenerId] = {
        event_type: eventType,
        listener_function: listenerFunction
    }
}

export function removeEventListenerWithId(element, listenerId)
{
    if (element.saved_event_listeners && element.saved_event_listeners[listenerId])
    {
        const {event_type: eventType, listener_function: listenerFunction} =
            element.saved_event_listeners[listenerId]
        element.removeEventListener(eventType, listenerFunction)
        delete element.saved_event_listeners[listenerId]
        return listenerFunction
    }
    return null
}
