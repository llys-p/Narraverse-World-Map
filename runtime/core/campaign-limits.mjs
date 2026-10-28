// New playable fixtures have a bounded longer session. Legacy budgets stay 128.
export const PLAYABLE_COMMAND_LIMIT=512,LEGACY_COMMAND_LIMIT=128;
export const campaignInputLimit=world=>['playable-v1','playable-v2'].includes(world?.mapModel?.playModel?.version)?PLAYABLE_COMMAND_LIMIT:LEGACY_COMMAND_LIMIT;
export const serviceCommandLimit=bundle=>bundle?.snapshot?.rulesVersion==='d-campaign-v1'&&bundle.snapshot.fixtureId==='campaign-village'&&['6','7'].includes(bundle.snapshot.fixtureVersion)?PLAYABLE_COMMAND_LIMIT:LEGACY_COMMAND_LIMIT;
