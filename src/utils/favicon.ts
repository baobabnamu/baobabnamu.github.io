export const startFaviconBlink = () => {
	const favicon = document.querySelector<HTMLLinkElement>('#site-favicon');
	if (!favicon) return;

	let visible = true;

	window.setInterval(() => {
		visible = !visible;
		const accent = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent')
			.trim();
		const opacity = visible ? 1 : 0;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 48"><rect x="8" y="7" width="16" height="34" fill="${accent}" opacity="${opacity}"/></svg>`;
		favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}, 550);
};
