export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.Dv0FDhxf.js",app:"_app/immutable/entry/app.CpUKwJnS.js",imports:["_app/immutable/entry/start.Dv0FDhxf.js","_app/immutable/chunks/DcuJ0syL.js","_app/immutable/chunks/CsRnS6_b.js","_app/immutable/chunks/D3KXE98W.js","_app/immutable/chunks/BUApaBEI.js","_app/immutable/chunks/kjrKQA1F.js","_app/immutable/entry/app.CpUKwJnS.js","_app/immutable/chunks/CsRnS6_b.js","_app/immutable/chunks/CUsNAJX2.js","_app/immutable/chunks/Cvafccii.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/kjrKQA1F.js","_app/immutable/chunks/ClwJedXj.js","_app/immutable/chunks/BylYIYj6.js","_app/immutable/chunks/CoZ_m1xq.js","_app/immutable/chunks/D3KXE98W.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js')),
			__memo(() => import('../output/server/nodes/5.js')),
			__memo(() => import('../output/server/nodes/6.js')),
			__memo(() => import('../output/server/nodes/7.js')),
			__memo(() => import('../output/server/nodes/8.js')),
			__memo(() => import('../output/server/nodes/9.js')),
			__memo(() => import('../output/server/nodes/10.js')),
			__memo(() => import('../output/server/nodes/11.js')),
			__memo(() => import('../output/server/nodes/12.js')),
			__memo(() => import('../output/server/nodes/13.js')),
			__memo(() => import('../output/server/nodes/14.js')),
			__memo(() => import('../output/server/nodes/15.js')),
			__memo(() => import('../output/server/nodes/16.js')),
			__memo(() => import('../output/server/nodes/17.js')),
			__memo(() => import('../output/server/nodes/18.js')),
			__memo(() => import('../output/server/nodes/19.js')),
			__memo(() => import('../output/server/nodes/20.js')),
			__memo(() => import('../output/server/nodes/21.js')),
			__memo(() => import('../output/server/nodes/22.js')),
			__memo(() => import('../output/server/nodes/23.js')),
			__memo(() => import('../output/server/nodes/24.js')),
			__memo(() => import('../output/server/nodes/25.js')),
			__memo(() => import('../output/server/nodes/26.js')),
			__memo(() => import('../output/server/nodes/27.js')),
			__memo(() => import('../output/server/nodes/28.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/admin",
				pattern: /^\/admin\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/admin/chat",
				pattern: /^\/admin\/chat\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/admin/content",
				pattern: /^\/admin\/content\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/admin/content/files",
				pattern: /^\/admin\/content\/files\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/admin/content/youtube",
				pattern: /^\/admin\/content\/youtube\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/admin/crawl4ai",
				pattern: /^\/admin\/crawl4ai\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/admin/internet-archive",
				pattern: /^\/admin\/internet-archive\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 11 },
				endpoint: null
			},
			{
				id: "/admin/sections",
				pattern: /^\/admin\/sections\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 12 },
				endpoint: null
			},
			{
				id: "/admin/statistics",
				pattern: /^\/admin\/statistics\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 13 },
				endpoint: null
			},
			{
				id: "/admin/users/bans",
				pattern: /^\/admin\/users\/bans\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 14 },
				endpoint: null
			},
			{
				id: "/admin/users/moderators",
				pattern: /^\/admin\/users\/moderators\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 15 },
				endpoint: null
			},
			{
				id: "/admin/users/supervisors",
				pattern: /^\/admin\/users\/supervisors\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 16 },
				endpoint: null
			},
			{
				id: "/api/admin/aggregates/popularity",
				pattern: /^\/api\/admin\/aggregates\/popularity\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/aggregates/popularity/_server.js'))
			},
			{
				id: "/api/admin/crawl4ai/control",
				pattern: /^\/api\/admin\/crawl4ai\/control\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/crawl4ai/control/_server.js'))
			},
			{
				id: "/api/admin/crawl4ai/crawl",
				pattern: /^\/api\/admin\/crawl4ai\/crawl\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/crawl4ai/crawl/_server.js'))
			},
			{
				id: "/api/admin/crawl4ai/jobs",
				pattern: /^\/api\/admin\/crawl4ai\/jobs\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/crawl4ai/jobs/_server.js'))
			},
			{
				id: "/api/admin/crawl4ai/status",
				pattern: /^\/api\/admin\/crawl4ai\/status\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/crawl4ai/status/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/bootstrap",
				pattern: /^\/api\/admin\/internet-archive\/engine\/bootstrap\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/bootstrap/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/diagnose",
				pattern: /^\/api\/admin\/internet-archive\/engine\/diagnose\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/diagnose/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/reset",
				pattern: /^\/api\/admin\/internet-archive\/engine\/reset\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/reset/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/seeds",
				pattern: /^\/api\/admin\/internet-archive\/engine\/seeds\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/seeds/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/start",
				pattern: /^\/api\/admin\/internet-archive\/engine\/start\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/start/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/status",
				pattern: /^\/api\/admin\/internet-archive\/engine\/status\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/status/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/stop",
				pattern: /^\/api\/admin\/internet-archive\/engine\/stop\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/stop/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/engine/tick",
				pattern: /^\/api\/admin\/internet-archive\/engine\/tick\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/engine/tick/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/import",
				pattern: /^\/api\/admin\/internet-archive\/import\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/import/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/preview",
				pattern: /^\/api\/admin\/internet-archive\/preview\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/preview/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/search",
				pattern: /^\/api\/admin\/internet-archive\/search\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/search/_server.js'))
			},
			{
				id: "/api/admin/internet-archive/sections",
				pattern: /^\/api\/admin\/internet-archive\/sections\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/internet-archive/sections/_server.js'))
			},
			{
				id: "/api/admin/noor-library/engine/reset",
				pattern: /^\/api\/admin\/noor-library\/engine\/reset\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/engine/reset/_server.js'))
			},
			{
				id: "/api/admin/noor-library/engine/seed",
				pattern: /^\/api\/admin\/noor-library\/engine\/seed\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/engine/seed/_server.js'))
			},
			{
				id: "/api/admin/noor-library/engine/start",
				pattern: /^\/api\/admin\/noor-library\/engine\/start\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/engine/start/_server.js'))
			},
			{
				id: "/api/admin/noor-library/engine/status",
				pattern: /^\/api\/admin\/noor-library\/engine\/status\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/engine/status/_server.js'))
			},
			{
				id: "/api/admin/noor-library/engine/stop",
				pattern: /^\/api\/admin\/noor-library\/engine\/stop\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/engine/stop/_server.js'))
			},
			{
				id: "/api/admin/noor-library/engine/tick",
				pattern: /^\/api\/admin\/noor-library\/engine\/tick\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/engine/tick/_server.js'))
			},
			{
				id: "/api/admin/noor-library/import",
				pattern: /^\/api\/admin\/noor-library\/import\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/import/_server.js'))
			},
			{
				id: "/api/admin/noor-library/jobs",
				pattern: /^\/api\/admin\/noor-library\/jobs\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/jobs/_server.js'))
			},
			{
				id: "/api/admin/noor-library/preview",
				pattern: /^\/api\/admin\/noor-library\/preview\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/preview/_server.js'))
			},
			{
				id: "/api/admin/noor-library/sections",
				pattern: /^\/api\/admin\/noor-library\/sections\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/noor-library/sections/_server.js'))
			},
			{
				id: "/api/admin/supervisors",
				pattern: /^\/api\/admin\/supervisors\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/supervisors/_server.js'))
			},
			{
				id: "/api/admin/supervisors/[uid]",
				pattern: /^\/api\/admin\/supervisors\/([^/]+?)\/?$/,
				params: [{"name":"uid","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/admin/supervisors/_uid_/_server.js'))
			},
			{
				id: "/api/auth/check",
				pattern: /^\/api\/auth\/check\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/auth/check/_server.js'))
			},
			{
				id: "/api/auth/request-code",
				pattern: /^\/api\/auth\/request-code\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/auth/request-code/_server.js'))
			},
			{
				id: "/api/auth/verify-code",
				pattern: /^\/api\/auth\/verify-code\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/auth/verify-code/_server.js'))
			},
			{
				id: "/api/build-info",
				pattern: /^\/api\/build-info\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/build-info/_server.js'))
			},
			{
				id: "/api/cron/aggregates-popularity",
				pattern: /^\/api\/cron\/aggregates-popularity\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/cron/aggregates-popularity/_server.js'))
			},
			{
				id: "/api/cron/internet-archive-tick",
				pattern: /^\/api\/cron\/internet-archive-tick\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/cron/internet-archive-tick/_server.js'))
			},
			{
				id: "/api/notify",
				pattern: /^\/api\/notify\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/notify/_server.js'))
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 17 },
				endpoint: null
			},
			{
				id: "/moderator",
				pattern: /^\/moderator\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 18 },
				endpoint: null
			},
			{
				id: "/moderator/chat",
				pattern: /^\/moderator\/chat\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 19 },
				endpoint: null
			},
			{
				id: "/moderator/content",
				pattern: /^\/moderator\/content\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 20 },
				endpoint: null
			},
			{
				id: "/moderator/content/files",
				pattern: /^\/moderator\/content\/files\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 21 },
				endpoint: null
			},
			{
				id: "/moderator/content/import-noor",
				pattern: /^\/moderator\/content\/import-noor\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 22 },
				endpoint: null
			},
			{
				id: "/moderator/content/multi",
				pattern: /^\/moderator\/content\/multi\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 23 },
				endpoint: null
			},
			{
				id: "/moderator/content/youtube",
				pattern: /^\/moderator\/content\/youtube\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 24 },
				endpoint: null
			},
			{
				id: "/moderator/internet-archive",
				pattern: /^\/moderator\/internet-archive\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 25 },
				endpoint: null
			},
			{
				id: "/moderator/sections",
				pattern: /^\/moderator\/sections\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 26 },
				endpoint: null
			},
			{
				id: "/moderator/statistics",
				pattern: /^\/moderator\/statistics\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 27 },
				endpoint: null
			},
			{
				id: "/search",
				pattern: /^\/search\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 28 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
