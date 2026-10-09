// M3-4A contract §4: the fixed closeout experience configurations. This module only deep-copies
// defaultCognitionVillageConfig and applies the frozen patch list for each kind; it exposes no
// free parameters, no HTTP/config injection and no auto-advance. work-learning runs the 12-day
// duty ladder with ON/OFF differing only in useWorkExperience; continuation keeps the default
// experience switch and lowers only actor-2 importance to 400 with no requests.
import { cloneData, requireCondition } from '../core/data-contract.mjs';
import { defaultCognitionVillageConfig } from '../fixtures/cognition-village.mjs';

export function createM3CloseoutConfig(kind, useWorkExperience = true) {
  requireCondition(kind === 'work-learning' || kind === 'continuation', 'Unknown closeout scenario kind');
  requireCondition(typeof useWorkExperience === 'boolean', 'Closeout experience switch must be boolean');
  if (kind === 'continuation') requireCondition(useWorkExperience === true, 'Continuation closeout only runs with work experience consumed');
  const config = cloneData(defaultCognitionVillageConfig());
  if (kind === 'work-learning') {
    config.memory.society.player.initialHerbs = 20;
    config.memory.society.player.initialFood = 30;
    config.memory.society.estates[1].initialFood = 100;
    config.memory.society.estates[2].initialFood = 30;
    const resources = config.memory.society.actors.market.ecology.resources.resources;
    resources.herbs.initial = 50;
    resources.gold.initial = 350;
    config.experience.useWorkExperience = useWorkExperience;
    config.motivation.requests = Array.from({ length: 12 }, (_, i) => ({
      requestId: `closeout-duty-${i + 1}`, tick: 200 + 144 * i, expiresTick: 432 + 144 * i,
      speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000,
    }));
  } else {
    config.cognition.profiles[0].importancePermille = 400;
    config.motivation.requests = [];
  }
  return config;
}
