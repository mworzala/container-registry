import AnyResponse, * as resp from '../util/response';

// GET /v2/
// https://docs.docker.com/registry/spec/api/#base
export const CheckVersion = (request: Request): AnyResponse => {
	return resp.OK;
}
