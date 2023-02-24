import { IRequest } from 'itty-router';

export function checkAuth(request: IRequest): boolean {
	//todo should do some proper checking here
	// const auth = request.headers.get('Authorization');
	// return auth != null;
	return true;
}
