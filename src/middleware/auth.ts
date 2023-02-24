import AnyResponse, * as resp from '../util/response';
import AnyRequest from '../util/request';

const AuthMiddleware = (req: AnyRequest): AnyResponse | undefined => {
	const authHeader = req.headers.get('Authorization');
	if (authHeader == null) {
		return resp.ERR_UNAUTHORIZED
	}
	// resp.ERR_UNAUTHORIZED.withDetail()
	//todo implement me
}

export default AuthMiddleware;
