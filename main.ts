import 'https://deno.land/x/xhr@0.1.1/mod.ts';

// @deno-types="https://cdn.esm.sh/v58/firebase@9.6.0/app/dist/app/index.d.ts"
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js';
import * as fs from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

import {
	Application,
	Context,
	Router,
} from 'https://deno.land/x/oak@v7.7.0/mod.ts';

interface FirestoreData {
	id: string;
	data: Respuestas;
}

interface Respuestas {
	restpuesta: {
		categoria: string;
		acceso: string;
	}[];
	usuario: string;
	rondaId: string;
}

interface Respuesta {
	palabra: string;
	categoria: string;
	votos: number;
	puntaje: number;
}

interface Usuarios {
	user: string;
	ready: boolean;
	leader: boolean;
	score: number;
}

interface AppState {
	roomId: string;
	roundId: string;
	data: FirestoreData[];
}

const firebaseConfig = JSON.parse(Deno.env.get('FIREBASE_CONFIG')!);

const firebaseApp = initializeApp(firebaseConfig);
const db = fs.getFirestore(firebaseApp);

const app = new Application<AppState>();

const router = new Router();

function reviewVotes(data: FirestoreData[]) {
	return Promise.all(
		data.map(async (r) => {
			const querySnapchotResponses = await fs.getDocs(
				fs.query(
					fs.collection(db, `Respuestas/${r.id}/Respuesta`),
					fs.where('votos', '<=', 0)
				)
			);
			querySnapchotResponses.docs.forEach(async (e) => {
				await fs.updateDoc(e.ref, {
					puntaje: 0,
				});
			});
		})
	);
}

async function getUserGeneralScore(
	data: FirestoreData[]
): Promise<Map<string, number>> {
	const scoreMap: Promise<Map<string, number>> = new Promise(
		(resolve, reject) => {
			try {
				const userMap = new Map<string, number>();
				Promise.all(
					data.map(async (r) => {
						const user = r.data.usuario;
						if (!userMap.get(user)) {
							userMap.set(user, 0);
						}
						const querySnapchotResponses = await fs.getDocsFromServer(
							fs.query(fs.collection(db, `Respuestas/${r.id}/Respuesta`))
						);
						querySnapchotResponses.docs.forEach((e) => {
							const resData: Respuesta = e.data();
							console.log('usuario puntaje', user, resData);
							userMap.set(user, userMap.get(user)! + resData.puntaje);
						});
					})
				).then(() => resolve(userMap));
			} catch (error) {
				reject(error);
				throw new Error(error);
			}
		}
	);

	return await scoreMap;
}

async function updateScoreOfUsers(
	roomId: string,
	userScoreMap: Map<string, number>
) {
	try {
		const querySnapchot = await fs.getDocs(
			fs.collection(db, `Salas/${roomId}/Usuarios`)
		);
		querySnapchot.docs.forEach(async (doc) => {
			await fs.updateDoc(doc.ref, {
				score: fs.increment(userScoreMap.get(doc.data().user)),
			});
		});
	} catch (error) {
		console.log('increment error', error);
		throw new Error(error);
	}
}

router.get('/checkvotes/:roomId/:rondaId', async (ctx, next) => {
	try {
		const rondaId = ctx.params.rondaId;
		const roomId = ctx.params.roomId;
		ctx.state.roundId = rondaId;
		ctx.state.roomId = roomId;
		console.log('routes');
		await next();

		console.log('arranque a calificar los usuarios');
		const scoreMap = await getUserGeneralScore(ctx.state.data);
		await updateScoreOfUsers(ctx.state.roomId, scoreMap);
		console.log('middleware termine de enviar los usuarios');

		ctx.response.status = 200;
		ctx.response.headers.set('Access-Control-Allow-Origin', '*');
		ctx.response.body = 'ok';
		ctx.response.type = 'text';
	} catch (error) {
		ctx.response.status = 404;
		ctx.response.body = 'something whent wrong';
		ctx.response.type = 'text';
		console.log(error);
	}
});

app.use(router.routes());

//change internal score on response base on votes
app.use(async (ctx, next) => {
	console.log('middleware cambio el puntaje de las respuestas');

	const q = fs.query(
		fs.collection(db, 'Respuestas'),
		fs.where('rondaId', '==', ctx.state.roundId)
	);

	const querySnapchot = await fs.getDocs(q);
	const data = querySnapchot.docs.map((doc) => ({
		id: doc.id,
		data: doc.data(),
	}));

	ctx.state.data = data;

	await reviewVotes(ctx.state.data).then((_) => console.log('no me rendire'));
	console.log('termine de cambiar puntajes');
	await next();
});

await app.listen({ port: 8000 });
