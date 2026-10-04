function buildInteractionPlan(states, width = 1280, height = 720) {
  return (states || []).map((state, index) => {
    const cursor = state.cursor || null;
    if (!cursor) return { step: state.step || index + 1, type: "static", focus: null, effects: [] };
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
  return (scenes || []).map((scene) => {
    let interaction = null;
    if (scene.id && /^workflow-\d+$/.test(scene.id)) {
      interaction = plan[Number(scene.id.split("-")[1]) - 1] || null;
    } else if (scene.id === "result" || scene.id === "close") {
      interaction = plan.length ? plan[plan.length - 1] : null;
    }
    return { ...scene, interaction };
  });
}

module.exports = { buildInteractionPlan, applyInteractionToScenes };
