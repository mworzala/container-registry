import AnyResponse, * as resp from '../util/response';
import AnyRequest from '../util/request';
import { Env } from '../index';

const AuthMiddleware = (req: AnyRequest, env: Env): AnyResponse | undefined => {
	const authHeader = req.headers.get('Authorization');
	if (authHeader == null) {
		return resp.ERR_UNAUTHORIZED;
	}

    const parts = authHeader.split(" ");
    if (parts.length != 2) {
        return resp.ERR_UNAUTHORIZED;
    }

    const [type, value] = parts;
    if (type !== "Basic") {
        return resp.ERR_UNAUTHORIZED;
    }

    if (value !== env.BASIC_AUTH) {
        return resp.ERR_UNAUTHORIZED;
    }
}

export default AuthMiddleware;
