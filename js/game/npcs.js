/**
 * game/npcs.js
 * NPC arc progression logic.
 * Does not read game state directly — receives state as argument.
 */

/**
 * Advances an NPC's arc score by delta.
 * If the new arc score crosses a scene threshold, returns the scene id to play.
 * @param {string} npcId
 * @param {number} delta
 * @param {object} state - GameState
 * @param {object|null} npcData - the NPC entry from npc_arcs.json (or null)
 * @returns {{ state: object, triggeredSceneId: string|null }}
 */
export function advanceArc(npcId, delta, state, npcData) {
  if (!state.npcs || !state.npcs[npcId]) return { state, triggeredSceneId: null };

  const npcState = state.npcs[npcId];
  const prevArc = npcState.arc;
  const newArc  = Math.max(0, Math.min(10, prevArc + delta));

  const newNpcState = { ...npcState, arc: newArc };
  const newState = {
    ...state,
    npcs: { ...state.npcs, [npcId]: newNpcState },
  };

  // Check if any arc scene threshold has been crossed
  let triggeredSceneId = null;

  if (npcData && Array.isArray(npcData.scenes)) {
    for (const sceneEntry of npcData.scenes) {
      const threshold = sceneEntry.stageRequired;
      if (prevArc < threshold && newArc >= threshold) {
        // Threshold crossed — queue the scene if not already played
        if (!newNpcState.scenesPlayed.includes(sceneEntry.sceneId)) {
          triggeredSceneId = sceneEntry.sceneId;
          // Mark as played immediately so it doesn't trigger again
          newState.npcs[npcId] = {
            ...newState.npcs[npcId],
            scenesPlayed: [...newNpcState.scenesPlayed, sceneEntry.sceneId],
          };
          break; // Only one scene per advance
        }
      }
    }
  }

  return { state: newState, triggeredSceneId };
}

/**
 * Returns current arc stage and relationship label for a given NPC.
 * @param {string} npcId
 * @param {object} state - GameState
 * @param {object|null} npcData - the NPC entry from npc_arcs.json
 * @returns {{ arc: number, relationship: string, stage: object|null, nextStage: object|null }}
 */
export function getStatus(npcId, state, npcData) {
  const npcState = state.npcs?.[npcId];
  if (!npcState) return { arc: 0, relationship: 'stranger', stage: null, nextStage: null };

  const arc = npcState.arc;
  let currentStage = null;
  let nextStage = null;

  if (npcData && Array.isArray(npcData.stages)) {
    const stages = [...npcData.stages].sort((a, b) => b.threshold - a.threshold);
    currentStage = stages.find(s => arc >= s.threshold) || npcData.stages[0];

    const forwardStages = [...npcData.stages].sort((a, b) => a.threshold - b.threshold);
    nextStage = forwardStages.find(s => s.threshold > arc) || null;
  }

  return {
    arc,
    relationship: currentStage ? currentStage.relationship : 'stranger',
    stage: currentStage,
    nextStage,
    scenesPlayed: npcState.scenesPlayed || [],
  };
}

/**
 * Finds an NPC arc scene object by scene id, searching all NPCs in the data.
 * @param {string} sceneId
 * @param {object[]} npcArcsData - full npc_arcs.json array
 * @returns {object|null} scene object
 */
export function findArcScene(sceneId, npcArcsData) {
  for (const npc of npcArcsData) {
    if (!Array.isArray(npc.arcScenes)) continue;
    const scene = npc.arcScenes.find(s => s.id === sceneId);
    if (scene) return scene;
  }
  return null;
}
