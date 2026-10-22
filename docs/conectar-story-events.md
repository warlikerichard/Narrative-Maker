# Conectar Story Events ao banco: roteiro para este projeto

Este é um roteiro para você implementar. Os exemplos abaixo **não foram aplicados ao código da aplicação nem executados como uma integração pronta**. Eles seguem os arquivos atuais e a documentação da versão de Next.js instalada no projeto.

O roteiro tem duas etapas distintas:

1. Persistir os eventos no SQLite que a aplicação já utiliza, entendendo cada camada.
2. Migrar o acesso ao banco inteiro para um serviço remoto antes de publicar na Vercel.

A primeira etapa usa um botão **Save changes**. É uma escolha didática: primeiro confirmar gravação, leitura e tratamento de erros; depois acrescentar autosave com debounce e uma fila de gravações.

## 1. Qual banco você tem e o que muda na Vercel

Hoje `src/lib/database.ts` abre um arquivo com `better-sqlite3`:

```ts
filename = process.env.DATABASE_PATH || "./data/narrative-maker.db"
```

Esse banco já guarda usuários, sessões, projetos, tipos de personagens e entidades. Story Events ainda ficam em `localStorage`, conforme `docs/story-events.md` e `src/lib/local-story-events.ts`.

SQLite em arquivo funciona localmente e pode funcionar em produção num servidor com disco persistente, backups e uma arquitetura compatível com seu modelo de concorrência. O disco local das funções da Vercel não oferece a persistência e o compartilhamento necessários para esse arquivo ser seu banco de produção. Colocá-lo em `/tmp` não resolve isso.

Fonte: [SQLite na Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

Para este projeto, eu consideraria:

| Opção | Implicação |
|---|---|
| Vercel + Turso/libSQL remoto | Preserva boa parte do SQL SQLite; exige trocar o driver e tornar o acesso assíncrono. |
| Vercel + PostgreSQL gerenciado, como Neon | Exige adaptar o driver, algumas consultas e o esquema para PostgreSQL. |
| Servidor com volume persistente + SQLite atual | Mantém o driver atual; você assume a operação e os backups desse armazenamento. |

Minha preferência, para reduzir a mudança neste código, seria **Turso remoto**. A Vercel oferece integração com Turso e bancos PostgreSQL pelo Marketplace. Você não precisa escrever outro backend: o servidor Next.js pode acessar o banco externo.

Fontes: [Marketplace da Vercel](https://vercel.com/marketplace), [PostgreSQL na Vercel](https://vercel.com/docs/postgres), [cliente oficial libSQL](https://github.com/tursodatabase/libsql-client-ts).

## 2. Entenda o caminho dos dados

```text
GRAVAR
StoryEventForm / StoryEventEditor — navegador
  → Server Action — servidor Next.js
    → requireUser + validação
      → NarrativeRepository — SQL e verificação do projeto
        → banco

LER
page.tsx — servidor Next.js
  → requireUser
    → NarrativeRepository
      → banco
  → entrega um StoryEvent ao componente React
```

O navegador não recebe a conexão nem as credenciais. Importar uma Server Action num Client Component faz o Next.js preparar uma chamada de rede para o servidor. Para a leitura inicial, o `page.tsx` pode consultar o banco diretamente, sem um `fetch` para a própria aplicação.

## 3. Criar a tabela no SQLite atual

**Arquivo: `src/lib/database.ts`.** Dentro do `db.exec(...)`, depois da criação de `projects`, acrescente:

```sql
CREATE TABLE IF NOT EXISTS story_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  image TEXT,
  sections_json TEXT NOT NULL DEFAULT '[]',
  character_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS story_events_project
  ON story_events(project_id);
```

O evento pertence a um projeto. O projeto já pertence a um usuário; não precisamos repetir `user_id` aqui. O `ON DELETE CASCADE` apaga seus eventos quando o projeto é excluído.

Para esta primeira implementação, a árvore de seções/subseções fica em JSON. `JSON.stringify` converte o array em texto ao salvar; `JSON.parse` recupera o array ao ler. A ordem dos arrays preserva a ordem do editor.

Isso é adequado para carregar e salvar o documento inteiro. Se depois precisar consultar seções individualmente ou editar vários trechos em colaboração, considere tabelas próprias para seções, subseções e a relação entre eventos e personagens. Os IDs de personagens em JSON não têm chaves estrangeiras: validaremos sua associação no servidor, e a UI atual já reconhece referências a personagens removidos.

O esquema atual é inicializado na abertura do banco. Reinicie o servidor de desenvolvimento após a alteração. Para mudanças futuras em tabelas existentes, use migrações versionadas; `CREATE TABLE IF NOT EXISTS` não altera uma tabela existente. Não apague o arquivo do banco para atualizar o esquema.

## 4. Validar o documento recebido

**Arquivo: `src/lib/validation.ts`.** Acrescente, usando o `z` já importado:

```ts
const storySubsectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200),
  description: z.string().max(20000),
});

export const storyEventInputSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(100),
  image: z.string()
    .max(2800000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable(),
  sections: z.array(
    storySubsectionSchema.extend({
      subsections: z.array(storySubsectionSchema).max(100),
    }),
  ).max(100),
  characterIds: z.array(z.string().uuid()).max(500),
});

export type StoryEventInput = z.infer<typeof storyEventInputSchema>;

export const storyEventWriteSchema = z.object({
  projectId: z.string().min(1).max(100),
  id: z.string().uuid().optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
  input: storyEventInputSchema,
}).refine(
  (value) => Boolean(value.id) === Boolean(value.expectedUpdatedAt),
  { message: "An existing event requires its saved version." },
);
```

Seções recém-criadas podem ter título vazio enquanto você escreve; o título principal deve estar preenchido ao salvar. Os limites de quantidade são escolhas deste exemplo e podem ser ajustados.

`id` ausente significa criação; presente significa atualização. `expectedUpdatedAt` é a versão que o editor leu. Ela impede que uma aba antiga sobrescreva silenciosamente uma gravação mais recente.

O exemplo mantém imagens em data URLs, como o projeto atual. A regex limita o formato aceito; ela não inspeciona os bytes da imagem. Para produção, prefira upload validado para armazenamento de objetos e guardar somente a referência no banco.

## 5. Acrescentar leitura, gravação e exclusão ao repositório

**Arquivo: `src/lib/repository.ts`.** Acrescente aos imports:

```ts
import type { StoryEvent } from "./types";
import type { StoryEventInput } from "./validation";
```

`randomUUID` já está importado. Antes da classe, acrescente:

```ts
type StoryEventRow = {
  id: string;
  projectId: string;
  title: string;
  image: string | null;
  sectionsJson: string;
  characterIdsJson: string;
  updatedAt: string;
};

const storyColumns = `id, project_id AS projectId, title, image,
  sections_json AS sectionsJson, character_ids_json AS characterIdsJson,
  updated_at AS updatedAt`;

function toStoryEvent(row: StoryEventRow): StoryEvent {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    image: row.image,
    sections: JSON.parse(row.sectionsJson),
    characterIds: JSON.parse(row.characterIdsJson),
    updatedAt: row.updatedAt,
  };
}
```

Dentro de `NarrativeRepository`, acrescente os quatro métodos:

```ts
listStoryEvents(userId: string, projectId: string): StoryEvent[] {
  this.requireProject(userId, projectId);
  const rows = this.db.prepare(`
    SELECT ${storyColumns} FROM story_events
    WHERE project_id=? ORDER BY updated_at DESC
  `).all(projectId) as StoryEventRow[];
  return rows.map(toStoryEvent);
}

getStoryEvent(userId: string, projectId: string, id: string): StoryEvent | null {
  this.requireProject(userId, projectId);
  const row = this.db.prepare(`
    SELECT ${storyColumns} FROM story_events WHERE id=? AND project_id=?
  `).get(id, projectId) as StoryEventRow | undefined;
  return row ? toStoryEvent(row) : null;
}

saveStoryEvent(
  userId: string,
  projectId: string,
  input: StoryEventInput,
  id?: string,
  expectedUpdatedAt?: string,
): StoryEvent {
  return this.db.transaction(() => {
    this.requireProject(userId, projectId);

    const previous = id ? this.getStoryEvent(userId, projectId, id) : null;
    if (id && !previous) throw new Error("Story event not found.");
    if (previous && previous.updatedAt !== expectedUpdatedAt) {
      throw new Error("This event changed elsewhere. Copy your draft before reloading.");
    }

    for (const characterId of input.characterIds) {
      const character = this.db.prepare(`
        SELECT id FROM entities WHERE id=? AND project_id=? AND kind='character'
      `).get(characterId, projectId);
      if (!character) throw new Error("Choose characters from this project.");
    }

    const eventId = id ?? randomUUID();
    // A versão deve avançar mesmo em gravações no mesmo milissegundo.
    const updatedAt = new Date(Math.max(
      Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0,
    )).toISOString();
    const sections = JSON.stringify(input.sections);
    const characters = JSON.stringify([...new Set(input.characterIds)]);

    if (previous) {
      const result = this.db.prepare(`
        UPDATE story_events
        SET title=?, image=?, sections_json=?, character_ids_json=?, updated_at=?
        WHERE id=? AND project_id=? AND updated_at=?
      `).run(input.title, input.image, sections, characters, updatedAt,
        eventId, projectId, previous.updatedAt);
      if (result.changes !== 1) throw new Error("The saved version has changed.");
    } else {
      this.db.prepare(`
        INSERT INTO story_events
          (id, project_id, title, image, sections_json, character_ids_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, projectId, input.title, input.image, sections, characters, updatedAt);
    }

    this.db.prepare("UPDATE projects SET updated_at=? WHERE id=?")
      .run(updatedAt, projectId);

    return {
      ...input, id: eventId, projectId, updatedAt,
      characterIds: [...new Set(input.characterIds)],
    };
  }).immediate();
}

deleteStoryEvent(userId: string, projectId: string, id: string) {
  this.db.transaction(() => {
    this.requireProject(userId, projectId);
    const result = this.db.prepare(
      "DELETE FROM story_events WHERE id=? AND project_id=?",
    ).run(id, projectId);
    if (!result.changes) throw new Error("Story event not found.");
    this.db.prepare("UPDATE projects SET updated_at=? WHERE id=?")
      .run(new Date().toISOString(), projectId);
  }).immediate();
}
```

`requireProject` verifica que o projeto é daquele usuário. Os `?` são parâmetros SQL: os valores não são concatenados na consulta. A transação torna a gravação do evento e a atualização do projeto uma única operação.

Ainda neste arquivo, substitua `projectColumns` para incluir os eventos na contagem:

```ts
const projectColumns = `p.id, p.name, p.description, p.image, p.status,
  p.favorite, p.updated_at AS updatedAt,
  ((SELECT count(*) FROM entities e WHERE e.project_id=p.id)
   + (SELECT count(*) FROM character_types t WHERE t.project_id=p.id)
   + (SELECT count(*) FROM story_events s WHERE s.project_id=p.id)) AS entityCount`;
```

## 6. Criar as Server Actions

**Arquivo: `src/app/actions.ts`.** Ele já começa com `"use server"`. Acrescente `StoryEvent` ao import de tipos, `storyEventWriteSchema` ao import de validações e importe `z` junto com `ZodError`:

```ts
import { z, ZodError } from "zod";
// Ajuste os imports existentes; não duplique ZodError.
```

Acrescente as funções:

```ts
export async function saveStoryEvent(raw: unknown): Promise<
  { ok: true; event: StoryEvent } | { ok: false; error: string }
> {
  const user = await requireUser();
  // Fora do try: requireUser pode redirecionar para o login.
  try {
    const data = storyEventWriteSchema.parse(raw);
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > 3500000) {
      return { ok: false, error: "The event is too large to save in one request." };
    }
    const event = new NarrativeRepository(getDatabase()).saveStoryEvent(
      user.id, data.projectId, data.input, data.id, data.expectedUpdatedAt,
    );
    revalidatePath("/");
    revalidatePath(`/projects/${data.projectId}`);
    revalidatePath(`/projects/${data.projectId}/story-events/${event.id}`);
    return { ok: true, event };
  } catch (error) {
    return { ok: false, error: errorResult(error).error ?? "Could not save the event." };
  }
}

export async function deleteStoryEvent(
  projectId: string,
  id: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = z.object({
      projectId: z.string().min(1).max(100),
      id: z.string().uuid(),
    }).parse({ projectId, id });
    new NarrativeRepository(getDatabase()).deleteStoryEvent(user.id, data.projectId, data.id);
    revalidatePath("/");
    revalidatePath(`/projects/${data.projectId}`);
    revalidatePath(`/projects/${data.projectId}/story-events/${data.id}`);
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}
```

`errorResult`, `getDatabase`, `NarrativeRepository`, `requireUser` e `revalidatePath` já existem nesse arquivo. O usuário vem da sessão no servidor, nunca de um `userId` enviado pelo formulário.

O projeto já configura `serverActions.bodySizeLimit` como `4mb` em `next.config.ts`. Mesmo assim, imagens em base64 e documentos grandes podem exceder o limite da requisição antes de a função rodar. O cliente também precisa tratar rejeições da chamada. Isso reforça a vantagem de separar o upload de imagem em produção.

## 7. Criar pelo formulário

**Arquivo: `src/components/story-event-form.tsx`.** Troque o import de `saveLocalStoryEvent` por:

```ts
import { saveStoryEvent } from "@/app/actions";
```

Remova `userId` das props e acrescente `useRef` ao import do React. Depois dos estados existentes, acrescente:

```ts
const [saving, setSaving] = useState(false);
const submitting = useRef(false);
```

Substitua `create`:

```tsx
async function create(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (imageBusy || submitting.current) return;
  submitting.current = true;
  setSaving(true);
  setError("");
  try {
    const result = await saveStoryEvent({
      projectId,
      input: { title, image, sections: [], characterIds: [] },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.push(`/projects/${projectId}/story-events/${result.event.id}`);
  } catch {
    setError("Could not confirm the save. Check the project before retrying.");
  } finally {
    submitting.current = false;
    setSaving(false);
  }
}
```

Troque `busy={imageBusy}` e os `disabled={imageBusy}` por `imageBusy || saving`. Substitua a mensagem “Saved in this browser only” por uma explicação de que o evento será salvo na conta. Remova também `userId={user.id}` da chamada de `StoryEventForm` em `workspace.tsx`.

O ID e a data passam a ser gerados pelo servidor. Em uma falha de rede, a gravação pode ter ocorrido sem a resposta chegar ao navegador; por isso, a mensagem orienta conferir a lista antes de criar novamente. Uma evolução para produção é adicionar uma chave de idempotência à criação.

## 8. Ler o evento ao abrir sua página

**Arquivo: `src/app/projects/[projectId]/story-events/[eventId]/page.tsx`.** Mantenha a autenticação, a leitura dos parâmetros, a verificação do projeto e a leitura dos personagens. Depois de `if (!project) notFound()`, acrescente:

```ts
const event = repository.getStoryEvent(user.id, projectId, eventId);
if (!event) notFound();
```

Substitua o retorno por:

```tsx
return (
  <StoryEventEditor
    key={`${user.id}:${projectId}:${eventId}`}
    project={project}
    initialEvent={event}
    characters={characters}
  />
);
```

Remova o comentário que diz que eventos permanecem no navegador. `params` continua sendo uma Promise e deve continuar com `await params`, como já está nesta versão do Next.js.

Este é o retrieve: a página obtém o registro do banco e o entrega como `initialEvent` ao editor.

## 9. Editar e salvar explicitamente

**Arquivo: `src/components/story-event-editor.tsx`.** Remova o import de `local-story-events` e importe:

```ts
import { saveStoryEvent, deleteStoryEvent } from "@/app/actions";
```

Substitua a função externa `StoryEventEditor`, que consulta localStorage, por:

```tsx
export function StoryEventEditor({ project, initialEvent, characters }: {
  project: Project;
  initialEvent: StoryEvent;
  characters: NarrativeEntity[];
}) {
  return (
    <EventDocument
      key={initialEvent.id}
      project={project}
      initialEvent={initialEvent}
      characters={characters}
    />
  );
}
```

Remova `userId` também da declaração e do tipo das props de `EventDocument`. Mantenha `draft`, `error`, `savedVersion` e os outros estados existentes. Acrescente:

```ts
const [dirty, setDirty] = useState(false);
const [saving, setSaving] = useState(false);
const draftRef = useRef(initialEvent);
const mutationInFlight = useRef(false);
```

Substitua `update` e acrescente `persist`:

```ts
function update(next: StoryEvent) {
  draftRef.current = next;
  setDraft(next);
  setDirty(true);
  return true; // Mantém os chamadores atuais, como a remoção de seção.
}

async function persist() {
  if (mutationInFlight.current) return;
  mutationInFlight.current = true;
  setSaving(true);
  setError("");
  const snapshot = draftRef.current;
  try {
    const result = await saveStoryEvent({
      projectId: project.id,
      id: snapshot.id,
      expectedUpdatedAt: savedVersion.current,
      input: {
        title: snapshot.title,
        image: snapshot.image,
        sections: snapshot.sections,
        characterIds: snapshot.characterIds,
      },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    savedVersion.current = result.event.updatedAt;
    // Não sobrescreva texto digitado enquanto a requisição estava em andamento.
    if (draftRef.current === snapshot) {
      draftRef.current = result.event;
      setDraft(result.event);
      setDirty(false);
    }
  } catch {
    setError("Could not confirm the save. Your draft is still on this page.");
  } finally {
    mutationInFlight.current = false;
    setSaving(false);
  }
}
```

Acrescente no cabeçalho, fora de outro botão ou link:

```tsx
<button type="button" className="button primary"
  disabled={saving || !dirty} onClick={persist}>
  {saving ? "Saving…" : "Save changes"}
</button>
```

Troque o texto do status por:

```tsx
{saving ? "Saving…" : error ? "Changes not saved"
  : dirty ? "Unsaved changes" : "Saved to your account"}
```

Faça também estes ajustes no mesmo arquivo:

- No botão “Retry saving”, troque `onClick={() => update(draft)}` por `onClick={persist}` e acrescente `disabled={saving}`.
- No `useEffect` de `beforeunload`, use `if (!dirty && !saving) return` e dependências `[dirty, saving]`.
- Em `beforeLeave`, troque a condição `error &&` por `(dirty || saving) &&`.
- Substitua a nota final de salvamento automático/local por “Use Save changes to save this event to your account.”

O aviso `beforeunload` protege fechamento/reload; `beforeLeave` protege os links em que ele já está ligado. Isso não constitui um bloqueio completo de toda navegação do App Router, incluindo o botão Voltar do navegador. Rascunhos locais recuperáveis e uma política completa de navegação são uma evolução separada.

Para excluir o evento, transforme `confirmRemoval` em `async function confirmRemoval()` e substitua somente seu ramo `if (removal.kind === "event")`:

```ts
if (removal.kind === "event") {
  if (mutationInFlight.current) return;
  mutationInFlight.current = true;
  setSaving(true);
  try {
    const result = await deleteStoryEvent(project.id, draft.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(projectHref);
  } catch {
    setError("Could not delete this event.");
  } finally {
    mutationInFlight.current = false;
    setSaving(false);
  }
  return;
}
```

Os ramos que removem seções/subseções continuam alterando `draft`; a alteração será persistida ao clicar em Save changes. Vincule também o estado `saving` ao botão/modal de confirmação de exclusão para indicar que há uma operação em andamento.

O salvamento automático poderá chamar essa camada de gravação depois de um intervalo sem digitação, mas precisa serializar as requisições e salvar o último rascunho pendente. Apenas adicionar `async` à antiga `update` causaria uma requisição por tecla e tratamento incorreto das versões.

## 10. Buscar os cards do banco

**Arquivo: `src/app/projects/[projectId]/page.tsx`.** Acrescente ao JSX de `Workspace`:

```tsx
storyEvents={repository.listStoryEvents(user.id, projectId)}
```

**Arquivo: `src/components/workspace.tsx`.** Importe o tipo `StoryEvent` e acrescente a prop `storyEvents = []` à desestruturação e `storyEvents?: StoryEvent[]` ao tipo das props.

Remova o import de `local-story-events`, a variável `localStories` e o bloco que renderiza `localStories.error`.

A criação de `storyEntries` passa a começar assim; mantenha o corpo do `.map` atual, que transforma título/seções em dados para os cards:

```ts
const storyEntries: NarrativeEntity[] = storyEvents
  .filter((event) => event.projectId === project?.id)
  .map((event) => ({
    id: event.id,
    projectId: event.projectId,
    kind: "storyEvent",
    name: event.title,
    description: event.sections.map((section) => section.title).join(" · "),
    image: event.image,
    characterTypeId: null,
    updatedAt: event.updatedAt,
  }));
```

O exemplo acima simplifica a descrição para mostrar somente títulos. Manter o `.map` original preserva a busca por conteúdo de seções e subseções.

Mantenha `allEntries = [...entities, ...storyEntries]`. Substitua todo o cálculo antigo de `displayProjects` por:

```ts
const displayProjects = projects;
```

As contagens agora vêm do SQL; somar os eventos novamente duplicaria os totais. A home, `src/app/page.tsx`, já chama `listProjects`, então receberá as novas contagens sem precisar carregar todos os documentos.

Importe `deleteStoryEvent` de `@/app/actions`. Em `confirmDelete`, substitua o ramo específico de Story Events por:

```ts
if (deletion.type === "entity" && deletion.entity.kind === "storyEvent") {
  const result = await run(
    () => deleteStoryEvent(deletion.entity.projectId, deletion.entity.id),
    "Story event deleted.",
  );
  if (result?.success) setDeletion(null);
  return;
}
```

O `run` já faz `router.refresh()`. Remova o bloco que chama `clearLocalProjectEvents` ao excluir projetos; o banco usa cascade para os novos eventos. Mantenha o fechamento da confirmação e a navegação para a home que já existem depois desse bloco.

Não envie Story Events para a função genérica `saveEntity`: a tabela `entities` não aceita esse tipo nem sua estrutura. Como reforço, ajuste `entitySchema` em `validation.ts` para aceitar apenas os tipos genéricos:

```ts
kind: z.enum(["characterType", "character", "region", "item"]),
```

Se `entityKinds` deixar de ser usado em `validation.ts`, remova seu import nesse arquivo. A lista completa em `types.ts` permanece, porque a interface precisa mostrar a categoria Story Events.

## 11. Rascunhos antigos e verificação

Os eventos antigos continuam na chave `narrative-maker:story-events:v1:<userId>` do navegador. Criar a tabela não os importa automaticamente. Preserve esses dados até decidir a importação.

Uma importação deve ler o armazenamento no navegador, apresentar os eventos ao usuário e enviar cada documento à mesma validação/autorização do servidor. Planeje também como mapear IDs, evitar duplicatas ao repetir a importação e tratar personagens que já não existem. Só marque como importado depois de confirmação do servidor.

Depois de implementar os passos, execute os scripts existentes:

```powershell
npm run typecheck
npm run lint
npm test
```

Atualize `tests/e2e/story-events.spec.ts`: atualmente ele verifica persistência local e ausência de POST. Com Server Actions, POST é esperado. Acrescente ou adapte cenários de:

- Criar, salvar, atualizar e excluir; recarregar e entrar com a mesma conta em outro contexto de navegador.
- Preservar ordem e IDs de seções e subseções.
- Negar leitura/gravação por outro usuário e negar personagens de outro projeto.
- Alterar o mesmo evento em duas abas: a segunda gravação com versão antiga deve retornar conflito.
- Excluir um projeto e verificar a remoção dos seus eventos.
- Simular erro de rede sem anunciar que um rascunho foi salvo.

Então execute `npm run test:e2e` e `npm run build`. Atualize também `docs/story-events.md` para refletir a nova persistência. Esses comandos são instruções para validar sua futura implementação; não foram executados para os exemplos deste documento.

## 12. Passar para Turso antes do deploy

**Esta seção é a segunda etapa, não uma substituição isolada que torna a aplicação atual pronta para Vercel.** Contas, sessões, projetos e personagens também precisam estar no banco remoto. Migrar só Story Events deixa o login dependente do arquivo local.

### 12.1 Provisionar o banco e instalar o cliente

Crie o banco remoto pelo painel do Turso ou pela integração [Turso na Vercel](https://vercel.com/marketplace/turso). Obtenha sua URL e um token com acesso adequado ao banco. No terminal do projeto:

```powershell
npm install @libsql/client
```

Crie `.env.local` na raiz do projeto:

```dotenv
TURSO_DATABASE_URL=libsql://SEU-BANCO.turso.io
TURSO_AUTH_TOKEN=SEU-TOKEN
```

Não use prefixo `NEXT_PUBLIC_` nessas variáveis. O `.gitignore` atual já ignora `.env*`, exceto `.env.example`; coloque somente nomes/placeholders nesse arquivo de exemplo. Use um banco de desenvolvimento separado do de produção.

### 12.2 Preparar o novo cliente, sem trocar o antigo prematuramente

Crie `src/lib/remote-database.ts`:

```ts
import "server-only";
import { createClient, type Client } from "@libsql/client";

let client: Client | undefined;

export function getRemoteDatabase(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error("Turso is not configured.");
  client = createClient({ url, authToken });
  return client;
}
```

O cliente é criado sob demanda. Não configuramos `file:` nem réplica local para usar o disco da Vercel como fonte persistente.

Fonte da API: [SDK TypeScript/libSQL oficial](https://tursodatabase.github.io/libsql-client-ts/).

### 12.3 Converter o acesso síncrono para assíncrono

O driver atual usa:

```ts
const row = db.prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
  .get(projectId, userId);
```

Com o cliente remoto, dentro de uma função `async`:

```ts
const result = await getRemoteDatabase().execute({
  sql: "SELECT id FROM projects WHERE id=? AND user_id=?",
  args: [projectId, userId],
});
const row = result.rows[0];
```

Mapeamento das principais chamadas:

| SQLite atual | Cliente remoto |
|---|---|
| `.prepare(sql).get(...args)` | `(await db.execute({ sql, args })).rows[0]` |
| `.prepare(sql).all(...args)` | `(await db.execute({ sql, args })).rows` |
| `.prepare(sql).run(...args).changes` | `(await db.execute({ sql, args })).rowsAffected` |
| `db.transaction(callback)` | Transação assíncrona com commit/rollback, ou batch para comandos independentes. |

Transações que leem a versão e gravam precisam usar o mesmo objeto de transação para todas as consultas envolvidas, inclusive a verificação de propriedade:

```ts
const tx = await getRemoteDatabase().transaction("write");
try {
  // await tx.execute(...) para checar projeto, ler versão e gravar documento.
  // Evite chamadas a métodos que usem o cliente global fora desta transação.
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
} finally {
  tx.close();
}
```

Esse trecho mostra o ciclo de vida; os comandos SQL são os das operações anteriores, adaptados para `execute`. Não substitua um callback síncrono de `better-sqlite3.transaction` por um callback `async`: o driver antigo não aguarda essa Promise como uma transação remota.

### 12.4 Arquivos que precisam acompanhar a troca

| Arquivo | Mudança necessária |
|---|---|
| `src/lib/database.ts` | Deixar de abrir arquivo local depois que todos os consumidores forem migrados; separar migrações da conexão. |
| `src/lib/repository.ts` | Tipo `Client`/executor remoto, métodos `async`, `execute`, mapeamento explícito de linhas e novas transações. |
| `src/lib/auth.ts` | Converter todas as consultas de usuários, sessões e tentativas de login; tornar `consumeAuthAttempt` assíncrona e manter seu limite atomicamente. |
| `src/app/actions.ts` | Usar `await` nas chamadas do repositório e de autenticação, incluindo `consumeAuthAttempt`; converter SQL direto do login e adaptar códigos de erro do driver. |
| `src/app/page.tsx` | `await repository.listProjects(user.id)`. |
| `src/app/projects/[projectId]/page.tsx` | Aguardar projetos, entidades e eventos antes de passar props. |
| `src/app/projects/[projectId]/story-events/[eventId]/page.tsx` | Aguardar consultas antes de `.find`/`.filter` e antes de renderizar o editor. |
| `tests/repository.test.ts` | Usar fixtures e métodos assíncronos com banco de teste separado. |
| `next.config.ts` / `package.json` | Remover configuração/dependência de `better-sqlite3` somente quando não houver consumidores, inclusive ferramentas/testes. |

Exemplo de atenção à ordem:

```ts
const entities = await repository.listEntities(user.id, projectId);
const characters = entities.filter((entry) => entry.kind === "character");
```

### 12.5 Esquema, dados e deploy

1. Extraia os `CREATE TABLE` e índices para uma migração SQL versionada, por exemplo `migrations/001_initial.sql`, incluindo a tabela de eventos. Aplique-a uma vez ao banco de destino por uma ferramenta/script de migração. Não envie os `PRAGMA` locais de WAL/busy_timeout como se configurassem um servidor remoto.
2. Confira as restrições de integridade no banco remoto, principalmente chaves estrangeiras/cascade. Faça isso em um banco de teste antes de migrar dados reais.
3. Se precisar dos dados atuais, faça uma exportação consistente com a aplicação sem gravar, valide o backup e importe preservando os IDs e a ordem de dependências: usuários → projetos → tipos → entidades → eventos. Trate conflitos explicitamente se o destino já tiver dados; não sobrescreva o destino às cegas. É possível pedir novo login em vez de migrar sessões antigas. Os eventos que ainda estão no navegador exigem a importação separada descrita acima.
4. Execute a aplicação local contra um banco remoto de desenvolvimento e repita os testes de autorização, concorrência e CRUD.
5. Na Vercel, configure `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no ambiente apropriado do projeto; se a integração as fornecer, confira os nomes e escopos. Separe Preview/Development de Production.
6. Aplique as migrações ao banco de produção antes de publicar código que dependa delas e faça o deploy com as variáveis configuradas.
7. Verifique cadastro/login, criar projeto, criar personagem e salvar/abrir evento em outro navegador. Testar somente o editor não verifica a migração do restante da aplicação.

Uma conexão remota configurada não transfere automaticamente nem o arquivo SQLite nem o localStorage. A aplicação só estará pronta para a Vercel quando todos os caminhos de dados que ela usa tiverem deixado de depender do arquivo local.
