# Monitorização e alertas — PUVO

Este documento cobre os endpoints de saúde, as métricas Prometheus, as regras de alerta e o procedimento de silenciamento. O objetivo é detetar indisponibilidade, erros 5xx, atraso no outbox e falta de disco antes de afetarem os utilizadores.

## Endpoints de saúde

| Endpoint | Uso | Comportamento |
| --- | --- | --- |
| `GET /api/v1/health/live` | Liveness | Responde sempre `200` enquanto o processo estiver vivo. Não consulta dependências. |
| `GET /api/v1/health/ready` | Readiness | Verifica PostgreSQL, atraso do outbox e escrita no diretório de media. Responde `200` quando tudo está saudável; `503` quando degradado. |
| `GET /api/v1/health` | Compatibilidade e Docker healthcheck | Alias de readiness. |

O relatório de readiness tem o formato:

```json
{
  "status": "ok",
  "checks": {
    "db": "ok",
    "outboxLagSeconds": 0,
    "media": "ok"
  }
}
```

Critérios:

- `db`: a consulta ao PostgreSQL tem de terminar sem erro.
- `outboxLagSeconds`: o evento mais antigo com estado `pending`, `processing` ou `failed` não pode ter mais de 300 segundos.
- `media`: o diretório definido em `MEDIA_DIR` tem de existir e ser escrevível.

O endpoint de readiness é chamado pelo healthcheck do contentor `api`. Uma resposta `503` impede que o `web` arranque com uma API degradada.

Verificação manual:

```bash
curl -si http://localhost:4000/api/v1/health/live
curl -si http://localhost:4000/api/v1/health/ready
```

## Métricas

O endpoint é `GET /api/v1/metrics`. Ele exige o header `x-metrics-token` com o valor de `METRICS_TOKEN`. Sem token, ou com token errado, responde `404` para não revelar a existência do endpoint.

O ingress devolve `404` para `/api/v1/metrics` em ambos os listeners. O scrape tem de ser feito diretamente na rede privada do Docker, por exemplo em `http://api:4000/api/v1/metrics`, nunca através do domínio público.

Métricas principais:

| Métrica | Tipo | Significado |
| --- | --- | --- |
| `praca_http_requests_total` | Counter | Pedidos por método, rota e código de estado. |
| `praca_http_request_duration_seconds` | Histogram | Latência por método, rota e código de estado. |
| `praca_outbox_oldest_age_seconds` | Gauge | Idade do evento mais antigo no outbox. |
| `process_*` / `nodejs_*` | Vários | Métricas padrão do processo e do runtime. |

A label `route` usa o caminho da rota Express, não o URL completo. Pedidos sem rota (404) usam `unmatched` para evitar cardinalidade alta.

### Configuração do Prometheus

Exemplo de scrape a correr na mesma rede Docker do Compose de produção:

```yaml
scrape_configs:
  - job_name: praca-api
    metrics_path: /api/v1/metrics
    static_configs:
      - targets: ["api:4000"]
    http_headers:
      x-metrics-token:
        values: ["<METRICS_TOKEN>"]
```

O token não deve ser commitado. Gerar um valor aleatório com pelo menos 32 bytes, guardá-lo no gestor de segredos e injetá-lo no template do Prometheus e no `.env.prod`:

```bash
openssl rand -hex 32
```

O Prometheus precisa de estar na mesma rede Docker, ou de um proxy interno autorizado. Não publicar `api:4000` na internet nem remover a regra `location = /api/v1/metrics { return 404; }` do ingress.

O `node_exporter` é necessário para o alerta de disco. Instalar no host, por exemplo:

```bash
sudo apt-get install -y prometheus-node-exporter
```

E adicionar ao Prometheus:

```yaml
scrape_configs:
  - job_name: node
    static_configs:
      - targets: ["host.docker.internal:9100"]
```

Se o Prometheus estiver em Docker no Linux, usar o IP do host ou `network_mode: host` para o exporter. Confirmar que `node_filesystem_avail_bytes` e `node_filesystem_size_bytes` estão disponíveis.

## Regras de alerta

As regras estão em `infra/monitoring/alerts.yml`.

| Alerta | Condição | Gravidade | Ação inicial |
| --- | --- | --- | --- |
| `PracaApiDown` | `up{job="praca-api"} == 0` por 2 min | Crítica | Verificar contentores, logs e readiness; reiniciar; escalar. |
| `PracaHigh5xxRate` | >2% de 5xx durante 10 min | Crítica | Procurar `req.id` nos logs, Sentry e último deploy; considerar rollback. |
| `PracaOutboxLag` | evento mais antigo >300 s por 10 min | Aviso | Verificar worker/outbox, emails e Redis; reprocessar. |
| `PracaDiskLow` | menos de 15% de disco livre por 15 min | Aviso | Limpar backups/logs antigos, aumentar disco; não apagar a base. |

### Rate limit indisponível (fail-open)

O `RateLimitService` é fail-open: se o Redis estiver indisponível, a escrita continua a funcionar e é registado um aviso:

```text
rate limit unavailable: ...
```

Criar no agregador de logs um alerta quando a mensagem `rate limit unavailable` ocorrer mais de uma vez em 5 minutos. O alerta deve incluir o serviço `api` e o ambiente; uma falha prolongada do Redis remove temporariamente os limites por utilizador, embora o backstop de IP do NGINX continue ativo.

Procedimento:

1. confirmar `docker compose ... ps redis` e a conectividade a `REDIS_URL`;
2. verificar memória, disco e logs do Redis;
3. reiniciar o Redis e confirmar que os limites voltam com um pedido de teste;
4. não desativar `RATE_LIMIT_ENABLED` para “resolver” o alerta;
5. se o Redis estiver instável, reduzir o tráfego de escrita e escalar.

Validar as regras antes de as carregar:

```bash
docker run --rm \
  -v "$PWD/infra/monitoring:/etc/prometheus" \
  prom/prometheus promtool check rules /etc/prometheus/alerts.yml
```

Resultado esperado: `SUCCESS: 4 rule(s) found` (ou equivalente, sem erros).

## Silenciamento

Silenciar apenas durante manutenção planeada ou investigação com responsável identificado. O silêncio não substitui a correção.

Exemplo com Alertmanager:

```bash
amtool silence add \
  alertname=PracaOutboxLag \
  --duration=2h \
  --comment="Manutenção planeada do worker de notificações — incidente INC-123" \
  --author="on-call@praca.ao"
```

Boas práticas:

- usar a duração mais curta possível;
- associar sempre um incidente ou janela de manutenção;
- nunca silenciar `PracaApiDown` sem comunicação prévia;
- confirmar no fim que o alerta volta a disparar se a condição persistir;
- registar o silêncio no canal de incidentes.

## Runbook rápido

### API em baixo

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml logs --tail 200 api
curl -si http://127.0.0.1:3200/api/v1/health/ready
```

Se o readiness indicar `db: down`, verificar PostgreSQL antes de reiniciar a API. Se indicar `media: down`, verificar permissões e espaço do volume `media_data`.

### Taxa de 5xx elevada

1. Identificar o período e as rotas afetadas em `praca_http_requests_total`.
2. Procurar um `req.id` nos logs JSON e no Sentry.
3. Comparar com o último deploy e migrations.
4. Se a taxa continuar acima de 2%, avaliar rollback para a imagem anterior.
5. Registar o incidente e a causa provável.

### Outbox atrasado

1. Confirmar que o processo que consome o outbox está a correr.
2. Verificar Redis, SMTP e logs de notificações.
3. Confirmar que não há eventos presos em `processing`.
4. Reprocessar os eventos com o procedimento documentado em `docs/service-notifications-reports.md`.
5. Escalar se o atraso ultrapassar 30 minutos.

### Disco baixo

1. Verificar `df -h` e o tamanho de `/var/backups/praca`, logs e volumes Docker.
2. Aplicar a retenção de backups e rodar logs.
3. Aumentar o disco se a limpeza não for suficiente.
4. Não remover o volume `postgres_data` nem `media_data`.

## Responsabilidade

- **Dono dos alertas:** Platform/DevOps lead.
- **Primeira resposta:** on-call.
- **Escalonamento:** on-call → tech lead → founder/CTO.
- **Alertas críticos:** notificar o canal de incidentes imediatamente.
- **Alertas de aviso:** tratar na janela de operação, salvo se houver agravamento.

O teste mensal de backup e o resultado do último scrape devem ser revistos na reunião operacional.
