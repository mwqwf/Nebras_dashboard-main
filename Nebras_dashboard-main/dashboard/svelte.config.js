import adapter from '@sveltejs/adapter-node';

// Firebase App Hosting runs SvelteKit as a long-running Node server on Cloud Run.
// `@sveltejs/adapter-node` produces a `build/` directory that is started via
// `node build` (see the `start` script in package.json). This is the required
// adapter for Firebase App Hosting; `adapter-auto` cannot detect this platform
// and causes the preparer step to fail before buildpacks start.
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		})
	}
};

export default config;
