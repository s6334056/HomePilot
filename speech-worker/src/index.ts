const ALLOWED_CONTENT_TYPES = new Set([
	"audio/webm",
	"audio/mp4",
	"audio/wav",
]);

function errorResponse(status: number, code: string, message: string): Response {
	return Response.json({ error: { code, message } }, { status });
}

export default {
	async fetch(request, env): Promise<Response> {
		if (request.method === "GET") {
			return new Response("HomePilot Speech Worker\n\nPOST audio data to this endpoint.", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			});
		}

		if (request.method !== "POST") {
			return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is allowed.");
		}

		const authHeader = request.headers.get("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return errorResponse(401, "UNAUTHORIZED", "Authentication required.");
		}
		const token = authHeader.slice(7);
		if (!env.WORKER_SECRET_TOKEN || token !== env.WORKER_SECRET_TOKEN) {
			return errorResponse(401, "UNAUTHORIZED", "Authentication required.");
		}

		const contentType = request.headers.get("Content-Type") || "";
		if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
			return errorResponse(
				400,
				"INVALID_REQUEST",
				`Unsupported Content-Type. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
			);
		}

		try {
			const audio = await request.arrayBuffer();

			if (audio.byteLength === 0) {
				return errorResponse(400, "NO_AUDIO_DATA", "No audio data received.");
			}

			const bytes = new Uint8Array(audio);
			let binary = "";
			for (let i = 0; i < bytes.length; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			const base64 = btoa(binary);

			const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
				audio: base64,
			});

			const text = typeof result.text === "string" ? result.text : "";
			const language =
				typeof result.transcription_info?.language === "string"
					? result.transcription_info.language
					: "";

			return Response.json({ text, language });
		} catch (error) {
			console.error(error);
			return errorResponse(
				500,
				"WHISPER_ERROR",
				error instanceof Error ? error.message : String(error),
			);
		}
	},
} satisfies ExportedHandler<Env>;
