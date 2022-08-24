import 'https://deno.land/x/xhr@0.1.1/mod.ts';

// @deno-types="https://cdn.esm.sh/v58/firebase@9.6.0/app/dist/app/index.d.ts"
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js';
import * as fs from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

import { Application, Router } from 'https://deno.land/x/oak@v7.7.0/mod.ts';

const firebaseConfig = JSON.parse(Deno.env.get('FIREBASE_CONFIG')!);

const firebaseApp = initializeApp(firebaseConfig);
const db = fs.getFirestore(firebaseApp);

const router = new Router();

router.get('/checkvotes/:rondaId', async (ctx) => {
	try {
		const rondaId = ctx.params.rondaId;
		const q = fs.query(
			fs.collection(db, 'Respuestas'),
			fs.where('rondaId', '==', rondaId)
		);
		const querySnapchot = await fs.getDocs(q);
		const data = querySnapchot.docs.map((doc) => ({
			id: doc.id,
			data: doc.data(),
		}));

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

		ctx.response.status = 200;
		ctx.response.body = 'good response';
		ctx.response.type = 'text';
	} catch (error) {
		ctx.response.status = 404;
		ctx.response.body = 'no data to update';
		ctx.response.type = 'text';
		console.log(error);
	}
});

const app = new Application();

app.use(router.routes());
await app.listen({ port: 8000 });
