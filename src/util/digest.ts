

export const hexToDigest = (sha256: ArrayBuffer): string => {
	const digest = [...new Uint8Array(sha256)]
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
	return `sha256:${digest}`;
};
