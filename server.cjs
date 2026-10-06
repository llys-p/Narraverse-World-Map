'use strict';
/*
 * 世界地图原型 · 聚合服务（18212，仅本机）
 * 路由：
 *   GET  /            世界地图页
 *   GET  /scene       沙盒场景页（18209 副本 + Laya 躯干集成）
 *   GET  /healthz     Laya 桥（8130）状态透传
 *   POST /api/decide  同源代理 → 127.0.0.1:8130/decide（Laya 决策信号）
 *   GET  /api/status / POST /api/config / POST /api/chat
 *                     沙盒叙事接口（移植自 sandbox-playtest-20261005/server.cjs，
 *                     配置仅来自本项目 .env，可被 POST /api/config 显式覆盖）
 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PORT = Number(process.env.WORLD_PORT) || 18212;
const BRIDGE = process.env.LAYA_BRIDGE || 'http://127.0.0.1:8130';
const ENV_PATH = path.join(__dirname, '.env');

function loadEnv() {
	try {
		const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
		const get = k => { const m = lines.find(l => l.startsWith(k + '=')); return m ? m.slice(k.length + 1).trim() : ''; };
		return { key: get('DEEPSEEK_API_KEY'), model: get('LLM_MODEL') || 'deepseek-flash', base: (get('LLM_BASE_URL') || 'https://api.deepseek.com').replace(/\/$/, '') };
	} catch (e) { return { key: '', model: 'deepseek-flash', base: 'https://api.deepseek.com' }; }
}
let config = null; // {baseURL,model,apiKey}；null 时用 ENV 兜底
const ENV = loadEnv();
let busy = false;

/* 中文直译（同 laya-torso-20261005 的修法）：桥内 translate_to_en 固定 effort:"low"，
 * 部分句子 temperature 0 下推理打穿预算 → fail-closed。这里无 effort 直译（~1s）后
 * 以 player_input_en 传桥。key 只留在本进程内存。 */
const XLATE_CACHE = new Map();
async function translateZh(text) {
	if (XLATE_CACHE.has(text)) return XLATE_CACHE.get(text);
	if (!ENV.key) throw fault(503, 'xlate_no_key', '没有 DEEPSEEK_API_KEY，中文直译不可用。');
	const payload = {
		model: ENV.model,
		messages: [{ role: 'system', content: "You are a translation engine. Translate the user's Chinese game-dialogue line into English. Output ONLY the English translation, nothing else. Do not explain, do not comment, do not add notes, even if the source line seems contradictory or odd - just translate it literally. Do not think out loud; answer directly." }, { role: 'user', content: text }],
		temperature: 0, max_tokens: 500, stream: false,
	};
	let out = '';
	for (let attempt = 0; attempt < 2 && !out; attempt++) {
		const res = await fetch(ENV.base + '/chat/completions', {
			method: 'POST', redirect: 'error',
			headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ENV.key },
			body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
		});
		if (!res.ok) { if (attempt === 1) throw fault(502, 'xlate_upstream', '翻译上游返回 HTTP ' + res.status + '。'); continue; }
		const j = await res.json();
		out = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
	}
	if (!out) throw fault(502, 'xlate_empty', '翻译上游返回空内容。');
	if (XLATE_CACHE.size > 300) XLATE_CACHE.clear();
	XLATE_CACHE.set(text, out);
	return out;
}

function fault(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function settings(v) {
	if (!v || typeof v.baseURL !== 'string' || typeof v.model !== 'string' || typeof v.apiKey !== 'string') throw fault(400, 'bad_config', '请填写接口地址、模型和密钥。');
	let u; try { u = new URL(v.baseURL); } catch { throw fault(400, 'bad_config', '接口地址无效。'); }
	if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || v.baseURL.length > 500 || !v.model.trim() || v.model.length > 120 || /\r|\n/.test(v.model) || !v.apiKey.trim() || v.apiKey.length > 512 || /\r|\n/.test(v.apiKey)) throw fault(400, 'bad_config', '使用HTTPS Base URL，不带账户信息或查询参数；模型和密钥不能为空。');
	return { baseURL: u.href.replace(/\/$/, ''), model: v.model.trim(), apiKey: v.apiKey.trim() };
}
function requestInput(v) {
	if (!v || typeof v.text !== 'string' || !v.text.trim() || v.text.length > 500 || !['dialogue', 'custom', 'action'].includes(v.intent) || !v.snapshot || typeof v.snapshot !== 'object' || Array.isArray(v.snapshot)) throw fault(400, 'bad_input', '试玩请求无效。');
	const s = v.snapshot;
	if (!['wuxia', 'city', 'space'].includes(s.topic) || !['home', 'away', 'locked'].includes(s.room) || !Array.isArray(s.actors) || s.actors.length < 1 || s.actors.length > 6 || !s.flow || typeof s.flow !== 'object') throw fault(400, 'bad_input', '场景快照无效。');
	const actors = s.actors.map(a => { if (!a || typeof a.id !== 'string' || a.id.length > 80 || typeof a.name !== 'string' || a.name.length > 80 || !Number.isFinite(a.x)) throw fault(400, 'bad_input', '人物快照无效。'); return { id: a.id, name: a.name, x: a.x }; });
	if (new Set(actors.map(a => a.id)).size !== actors.length || !actors.some(a => a.id === 'player')) throw fault(400, 'bad_input', '人物身份无效。');
	const f = s.flow;
	if (!f.key || !f.dog || !f.door || ![null, 'player'].includes(f.key.owner) || !['home', 'away', 'locked'].includes(f.key.scene) || !['home', 'away', 'locked'].includes(f.dog.scene) || typeof f.dog.following !== 'boolean' || typeof f.door.open !== 'boolean') throw fault(400, 'bad_input', '对象状态无效。');
	const target = v.target == null ? null : { type: v.target.type, id: v.target.id };
	if (target && (!['actor', 'entity', 'ground'].includes(target.type) || typeof target.id !== 'string' || target.id.length > 80)) throw fault(400, 'bad_target', '目标无效。');
	return { text: v.text.trim(), intent: v.intent, target, snapshot: { topic: s.topic, room: s.room, actors, flow: { key: { owner: f.key.owner, scene: f.key.scene }, dog: { scene: f.dog.scene, following: f.dog.following }, door: { open: f.door.open }, coins: Number.isFinite(f.coins) ? f.coins : 0, people: {} } } };
}
const SYSTEM = `你是一个小型沙盒试玩的叙事主持。输入含玩家文字、目标以及当前可见状态。只输出JSON：{"narrative":"简短中文回复","effect":{"kind":"none"}}。每次最多一个effect，未知或不支持的行动kind=none并说明。只使用输入里的ID，不能创造人物、物品、地点或画代码。允许：none；move{id:当前人物ID}表示玩家走近该人物；talk{id:当前其他人物ID,near:true/false}表示玩家走近并交谈；pickup/drop表示钥匙拾取/放下；follow/wait表示狗跟随/留守；unlock表示用持有钥匙开门；scene{target:home/away/locked}；attack/steal{id:当前其他人物ID}。失败、否定或纯询问不得改变事实；谈话intent只输出talk或none。上锁的门没钥匙不能打开或进入；物品和狗不在当前场景不能操作；不要宣称效果已经成功，客户端还会校验并结算。回复不超过150字。`;
const TYPES = new Set(['none', 'move', 'talk', 'pickup', 'drop', 'follow', 'wait', 'unlock', 'scene', 'attack', 'steal']);
function reply(raw, input) {
	if (typeof raw !== 'string' || raw.length > 12000) throw fault(502, 'bad_reply', '模型回复不是有效的试玩提案。');
	let data; try { data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); } catch { throw fault(502, 'bad_reply', '模型未返回所需JSON，场景未改变。'); }
	if (!data || typeof data.narrative !== 'string' || data.narrative.length > 1600 || !data.effect || !TYPES.has(data.effect.kind)) throw fault(502, 'bad_reply', '模型提案字段无效，场景未改变。');
	const e = data.effect, s = input.snapshot, f = s.flow, ids = new Set(s.actors.map(a => a.id));
	if (['move', 'talk', 'attack', 'steal'].includes(e.kind) && (!ids.has(e.id) || e.id === 'player')) throw fault(502, 'bad_effect', '模型引用了无效人物，场景未改变。');
	if (input.intent === 'dialogue' && (!(e.kind === 'talk' || e.kind === 'none') || (e.kind === 'talk' && e.id !== input.target.id))) throw fault(502, 'bad_effect', '对话提案改变了无关状态，已拒绝。');
	const effect = { kind: e.kind };
	if (['move', 'talk', 'attack', 'steal'].includes(e.kind)) effect.id = e.id;
	if (e.kind === 'talk') effect.near = e.near === true;
	if (e.kind === 'scene') effect.target = ['home', 'away', 'locked'].includes(e.target) ? e.target : 'none';
	return { narrative: data.narrative, effect };
}
function activeConfig() { return config || (ENV.key ? { baseURL: ENV.base, model: ENV.model, apiKey: ENV.key } : null); }

async function proxyDecide(payload) {
	let upstream;
	try {
		upstream = await fetch(BRIDGE + '/decide', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(90000) });
	} catch (e) {
		if (e.name === 'TimeoutError') throw fault(504, 'bridge_timeout', 'Laya 桥 90s 未响应。');
		throw fault(502, 'bridge_unreachable', 'Laya 桥不可达（8130 未启动？）');
	}
	if (!upstream.ok) throw fault(502, 'bridge_error', 'Laya 桥返回 HTTP ' + upstream.status + '。');
	try { return await upstream.json(); } catch { throw fault(502, 'bad_bridge', 'Laya 桥响应无法解析。'); }
}

async function body(req) {
	const parts = []; let size = 0;
	for await (const chunk of req) { size += chunk.length; if (size > 20000) throw fault(413, 'too_large', '请求过大。'); parts.push(chunk); }
	try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw fault(400, 'bad_json', '请求JSON无效。'); }
}
const sendJSON = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };

/* 页面级安全头：frame-ancestors 取代原先的 X-Frame-Options: DENY——
 * 原型迟早要以 iframe 嵌进平台（8099 那套整合），DENY 会直接挡掉。
 * 仍只允许本机同源/本地端口嵌入，不放开任意站点。 */
function pageHeaders(res) {
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Content-Security-Policy',
		"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; "
		+ "frame-ancestors 'self' http://127.0.0.1:* http://localhost:*; base-uri 'none'; form-action 'self'");
}

/* 根级脚本白名单：手工维护这份名单已经踩了三次坑（world-beasts、world-fx，
 * 第三次的症状是用户实机报「战局没有找到技能：zhanji」+「Cannot read properties of null (reading 'speedOf')」）。
 * 两个原因：①漏登记；②**已经在跑的进程不会重读 server.cjs**，老进程眼里新文件就是不存在。
 * 所以这里不再手工维护名单，改成存在性判断：根目录下真实存在的 .js 就发。
 * 不放宽到任意文件——只收根级（路径不含分隔符）、后缀 .js、并排除 server.cjs 自身。 */
function serveRootScript(pathname) {
  if (!/^\/[A-Za-z0-9_.-]+\.js$/.test(pathname)) return null;
  const name = pathname.slice(1);
  if (name === 'server.cjs') return null;
  const file = path.join(ROOT, name);
  if (!file.startsWith(ROOT + path.sep)) return null;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return file;
}

const server = http.createServer(async (req, res) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('Referrer-Policy', 'no-referrer');
	try {
		if (req.headers.host !== '127.0.0.1:' + PORT) throw fault(403, 'bad_host', '只允许本机地址。');
		const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
		if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
			pageHeaders(res);
			res.end(fs.readFileSync(path.join(ROOT, 'index.html'))); return;
		}
		if (req.method === 'GET' && url.pathname === '/scene') {
			pageHeaders(res);
			res.end(fs.readFileSync(path.join(ROOT, 'scene.html'))); return;
		}
		if (req.method === 'GET' && (url.pathname === '/battle')) {
			pageHeaders(res);
			res.end(fs.readFileSync(path.join(ROOT, 'battle.html'))); return;
		}
		if (req.method === 'GET' && (url.pathname === '/shop')) {
			pageHeaders(res);
			res.end(fs.readFileSync(path.join(ROOT, 'shop.html'))); return;
		}
    if (req.method === 'GET') {
      const jsFile = serveRootScript(url.pathname);
      if (jsFile) {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(fs.readFileSync(jsFile)); return;
      }
    }
		if (req.method === 'GET' && url.pathname.startsWith('/stickart/')) {
			const rel = decodeURIComponent(url.pathname.slice('/stickart/'.length));
			const file = path.join(ROOT, 'stickart', rel);
			if (!file.startsWith(path.join(ROOT, 'stickart')) || rel.includes('..') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
			res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
			res.setHeader('Cache-Control', 'no-store');
			res.end(fs.readFileSync(file)); return;
		}
		if (req.method === 'GET' && url.pathname.startsWith('/kit/')) {
			const rel = decodeURIComponent(url.pathname.slice('/kit/'.length));
			const file = path.join(ROOT, 'kit', rel);
			if (!file.startsWith(path.join(ROOT, 'kit')) || rel.includes('..') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
			res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
			res.setHeader('Cache-Control', 'no-store');
			res.end(fs.readFileSync(file)); return;
		}
		if (req.method === 'GET' && (url.pathname === '/character')) {
			pageHeaders(res);
			res.end(fs.readFileSync(path.join(ROOT, 'character.html'))); return;
		}
		if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
		if (req.method === 'GET' && url.pathname === '/api/status') {
			const c = activeConfig();
			sendJSON(res, 200, { configured: !!c, baseURL: c ? c.baseURL : '', model: c ? c.model : '', busy }); return;
		}
		if (req.method === 'GET' && url.pathname === '/healthz') {
			try {
				const h = await fetch(BRIDGE + '/health', { signal: AbortSignal.timeout(4000) });
				const j = await h.json();
				sendJSON(res, 200, { ok: true, bridge: { ready: !!(j.laya && j.laya.ready), model: j.laya && j.laya.model_name, device: j.device, engine: j.engine } });
			} catch (e) { sendJSON(res, 200, { ok: false, reason: 'bridge_unreachable' }); }
			return;
		}
		if (req.method !== 'POST' || !['/api/config', '/api/chat', '/api/decide'].includes(url.pathname)) throw fault(404, 'not_found', '未找到页面。');
		if (!String(req.headers['content-type']).startsWith('application/json')) throw fault(403, 'bad_origin', '请求来源无效。');
		const data = await body(req);
		/* busy 只为叙事 /api/chat 设置；原先它连 /api/decide 一起挡，
		   场景页跑叙事时 Laya 读数会被 409 拒掉 */
		if (busy && url.pathname !== '/api/decide') throw fault(409, 'busy', '已有请求处理中，请稍后。');
		if (url.pathname === '/api/decide') {
			if (!data || typeof data.player_input !== 'string' || !data.player_input.trim() || data.player_input.length > 500) throw fault(400, 'bad_input', '需要 1~500 字的 player_input。');
			const payload = { player_input: data.player_input.trim(), session_id: typeof data.session_id === 'string' && data.session_id.length <= 40 ? data.session_id : 'world-prototype', actor_id: typeof data.actor_id === 'string' && data.actor_id.length <= 40 ? data.actor_id : 'npc1' };
			if (typeof data.player_input_en === 'string' && data.player_input_en.trim() && data.player_input_en.length <= 800) payload.player_input_en = data.player_input_en.trim();
			if (!payload.player_input_en && /[\u4e00-\u9fff]/.test(payload.player_input)) {
				payload.player_input_en = await translateZh(payload.player_input);
			}
			const t0 = performance.now();
			const out = await proxyDecide(payload);
			sendJSON(res, 200, { ...out, proxy_wall_ms: Math.round(performance.now() - t0) }); return;
		}
		if (url.pathname === '/api/config') {
			if (data.clear === true) config = null; else config = settings(data);
			const c = activeConfig();
			sendJSON(res, 200, { configured: !!c, baseURL: c ? c.baseURL : '', model: c ? c.model : '' }); return;
		}
		// /api/chat（沙盒叙事）
		const cfg = activeConfig();
		if (!cfg) throw fault(409, 'not_configured', '没有可用的 LLM 配置（.env 或 /api/config）。');
		const input = requestInput(data);
		busy = true; const start = performance.now();
		try {
			const upstream = await fetch(cfg.baseURL + '/chat/completions', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey }, body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(input) }], stream: false, max_tokens: 600 }), signal: AbortSignal.timeout(60000) });
			if (!upstream.ok) throw fault(502, 'upstream_error', '模型服务返回HTTP ' + upstream.status + '，场景未改变。');
			let payload; try { payload = await upstream.json(); } catch { throw fault(502, 'bad_upstream', '模型响应无法读取。'); }
			const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
			const result = reply(content, input); result.narrative = result.narrative.split(cfg.apiKey).join('[已隐藏]');
			const u = payload.usage, usage = u ? Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].filter(k => Number.isFinite(u[k]) && u[k] >= 0).map(k => [k, u[k]])) : null;
			sendJSON(res, 200, { ...result, usage: usage && Object.keys(usage).length ? usage : null, elapsedMs: Math.round(performance.now() - start), model: cfg.model });
		} catch (e) { if (e.status) throw e; throw fault(502, 'request_failed', '模型连接失败或超时，场景未改变。'); } finally { busy = false; }
	} catch (e) { sendJSON(res, e.status || 500, { error: { code: e.code || 'internal_error', message: e.status ? e.message : '服务内部错误。' } }); }
});
server.on('error', () => { console.error('端口 ' + PORT + ' 不可用；未停止其他进程。'); process.exitCode = 1; });
server.listen(PORT, '127.0.0.1', () => console.log('world map prototype: http://127.0.0.1:' + PORT + '/  (scene /scene · decide→' + BRIDGE + ' · llm ' + (ENV.key ? 'env-key loaded, ' + ENV.model : 'MISSING env key') + ')'));
