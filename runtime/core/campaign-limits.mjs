// New playable fixtures have a bounded longer session. Legacy budgets stay 128.
export const PLAYABLE_COMMAND_LIMIT=512,LEGACY_COMMAND_LIMIT=128;
export const campaignInputLimit=world=>world?.mapModel?.playModel?.version==='playable-v1'?PLAYABLE_COMMAND_LIMIT:LEGACY_COMMAND_LIMIT;
export const serviceCommandLimit=bundle=>bundle?.snapshot?.rulesVersion==='d-campaign-v1'&&bundle.snapshot.fixtureId==='campaign-village'&&bundle.snapshot.fixtureVersion==='6'?PLAYABLE_COMMAND_LIMIT:LEGACY_COMMAND_LIMIT;
