import 'https://deno.land/x/xhr@0.1.1/mod.ts';

// @deno-types="https://cdn.esm.sh/v58/firebase@9.6.0/app/dist/app/index.d.ts"
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js';
import * as fs from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

import { Application, Router } from 'https://deno.land/x/oak@v7.7.0/mod.ts';

const firebaseConfig = JSON.parse(Deno.env.get('FIREBASE_CONFIG')!);

const firebaseApp = initializeApp(firebaseConfig);
const db = fs.getFirestore(firebaseApp);

const router = new Router();

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

function reviewVotes(data: FirestoreData[]) {
	data.forEach(async (r) => {
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
	});
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
						const querySnapchotResponses = await fs.getDocs(
							fs.query(fs.collection(db, `Respuestas/${r.id}/Respuesta`))
						);
						querySnapchotResponses.docs.forEach((e) => {
							const resData: Respuesta = e.data();
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
	const querySnapchot = await fs.getDocs(
		fs.collection(db, `Salas/${roomId}/Usuarios`)
	);
	querySnapchot.docs.forEach(async (doc) => {
		await fs.updateDoc(doc.ref, {
			score: userScoreMap.get(doc.data().user),
		});
	});
}

router.get('/checkvotes/:roomId/:rondaId', async (ctx) => {
	try {
		console.log('mandaron request aca');
		const rondaId = ctx.params.rondaId;
		const roomId = ctx.params.roomId;
		console.log('roundID', rondaId);
		console.log('roomId', roomId);

		const q = fs.query(
			fs.collection(db, 'Respuestas'),
			fs.where('rondaId', '==', rondaId)
		);
		const querySnapchot = await fs.getDocs(q);
		const data = querySnapchot.docs.map((doc) => ({
			id: doc.id,
			data: doc.data(),
		}));

		console.log('data', data);
		await reviewVotes(data);
		const scoreMap = await getUserGeneralScore(data);
		console.log(scoreMap);
		await updateScoreOfUsers(roomId!, scoreMap);

		ctx.response.status = 200;
		ctx.response.body = 'ok';
		ctx.response.type = 'text';
	} catch (error) {
		ctx.response.status = 404;
		ctx.response.body = 'something whent wrong';
		ctx.response.type = 'text';
		console.log(error);
	}
});

const app = new Application();

app.use(router.routes());
await app.listen({ port: 8000 });
