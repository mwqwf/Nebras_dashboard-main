import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// يسمح بفتح التطبيق من الهاتف على نفس شبكة Wi‑Fi عبر عنوان الـ LAN
		host: true
	}
});
