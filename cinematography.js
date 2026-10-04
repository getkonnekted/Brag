function buildInteractionPlan(states, width = 1280, height = 720) {
  return (states || []).map((state, index) => {
    const cursor = state.cursor || null;
    if (!cursor) return { step: state.step || index + 1, type: "static", focus: null };
    return {
      step: state.step || index + 1,
      type: "focus-click",
      focus: {
        x: Math.round(width * Number(cursor.x || 0) / 1440),
        y: Math.round(height * Number(cursor.y || 0) / 900)
      },
      effects: ["cursor-highlight", "click-ring", "focus-hold"]
    };
  });
}

function applyInteractionToScenes(scenes, states) {
  const plan = buildInteractionPlan(states);
  return (scenes || []).map((scene, index) => ({
    ...scene,
    interaction: plan[index] || null
  }));
}

module.exports = { buildInteractionPlan, applyInteractionToScenes };
