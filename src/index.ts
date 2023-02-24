import { router } from './routes';
import { APIError, ResponseBuilder } from './util/response';

export interface Env {
	store: KVNamespace;
	dataBucket: R2Bucket;
}

export default {
	fetch: async (req: Request, env: Env): Promise<Response> => {
		const res = await router.handle(req, env);
		if (res instanceof APIError)
			return res.toResponse();
		else if (res instanceof ResponseBuilder)
			return res.toResponse();
		return res;
	},
};
