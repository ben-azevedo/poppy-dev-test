

### Issue: What exactly did we fix with the double messages?

The root bug was this pattern (what you had before):

setMessages((prev) => {
  const updated = [...prev, { role: "user", content: transcript }];
  void sendToPoppy(updated);  // ❌ side-effect inside setState updater
  return updated;
});


Two important things here:

Side-effect inside the state updater

The updater function passed to setMessages is supposed to be pure:
“Given prev, return the next state.”

We were doing something extra: calling sendToPoppy(updated) inside that updater. That’s a side-effect.

React 18 dev mode runs updaters twice

In development, React Strict Mode intentionally calls those updaters twice to detect unsafe side effects.

That means this block ran 2x for the same voice input:

1st call → sendToPoppy(updated) ✅

2nd call → sendToPoppy(updated) 😬

Result: two API calls, two replies, two assistant messages.
The browser’s speech engine cancels the first utterance when the second one starts, so you only hear the second.

What we changed:

We removed side-effects from the updater.

We started using a messagesRef and providerRef so callbacks always “see” the latest data.

We call sendToPoppy once per onresult, outside of setMessages:

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;

  const currentProvider = providerRef.current;

  const updated = [
    ...messagesRef.current,
    { role: "user", content: transcript },
  ];

  // 1) Pure state update
  setMessages(updated);

  // 2) Side-effect: send to backend ONCE
  sendToPoppy(updated, currentProvider).finally(() => {
    isProcessingRef.current = false;
  });
};


And we:

synced messagesRef with state in a useEffect, and

used isProcessingRef as a guard in case onresult fires twice in dev.

So the fix in one sentence:

We stopped doing side effects inside the React state updater (which dev-mode runs twice) and moved them into a normal function using refs, so each voice turn only triggers one API call.