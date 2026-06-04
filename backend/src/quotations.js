const { z } = require("zod");
const { buildSeedQuotations } = require("./quotationSeed");

const quotationBodySchema = z.object({
  clientName: z.string().min(1),
  coverType: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  sourceAgent: z.string().optional().default(""),
  dateReceived: z.string().nullable().optional(),
  dateSentToInsurer: z.string().nullable().optional(),
  insurer: z.string().optional().default(""),
  dateReceivedFromInsurer: z.string().nullable().optional(),
  status: z.string().min(1),
  policyNumber: z.string().optional().default(""),
  premium: z.number().nullable().optional(),
  sumInsured: z.number().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  notes: z.string().optional().default(""),
  lastFollowUp: z.string().nullable().optional(),
  followUpHistory: z.array(z.object({ date: z.string(), note: z.string() })).optional(),
  statusHistory: z
    .array(z.object({ date: z.string(), status: z.string() }))
    .optional(),
});

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToClient(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    coverType: row.cover_type,
    contactPerson: row.contact_person,
    sourceAgent: row.source_agent,
    dateReceived: row.date_received,
    dateSentToInsurer: row.date_sent_to_insurer,
    insurer: row.insurer,
    dateReceivedFromInsurer: row.date_received_from_insurer,
    status: row.status,
    policyNumber: row.policy_number || "",
    premium: row.premium != null ? Number(row.premium) : null,
    sumInsured: row.sum_insured != null ? Number(row.sum_insured) : null,
    renewalDate: row.renewal_date,
    notes: row.notes || "",
    lastFollowUp: row.last_follow_up,
    followUpHistory: parseJsonArray(row.follow_up_history),
    statusHistory: parseJsonArray(row.status_history),
  };
}

function bodyToDbColumns(body) {
  const followUpHistory = body.followUpHistory || [];
  const statusHistory =
    body.statusHistory ||
    (body.status && body.dateReceived
      ? [{ date: body.dateReceived, status: body.status }]
      : []);

  return {
    client_name: body.clientName.trim(),
    cover_type: body.coverType || "",
    contact_person: body.contactPerson || "",
    source_agent: body.sourceAgent || "",
    date_received: body.dateReceived || null,
    date_sent_to_insurer: body.dateSentToInsurer || null,
    insurer: body.insurer || "",
    date_received_from_insurer: body.dateReceivedFromInsurer || null,
    status: body.status,
    policy_number: body.policyNumber || "",
    premium: body.premium ?? null,
    sum_insured: body.sumInsured ?? null,
    renewal_date: body.renewalDate || null,
    notes: body.notes || "",
    last_follow_up: body.lastFollowUp || null,
    follow_up_history: JSON.stringify(followUpHistory),
    status_history: JSON.stringify(statusHistory),
  };
}

async function listQuotationsResponse(pool) {
  const result = await pool.query("SELECT * FROM quotations ORDER BY id ASC");
  const quotations = result.rows.map(rowToClient);
  const maxId = quotations.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0);
  return { quotations, nextId: maxId + 1 };
}

async function ensureQuotationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotations (
      id SERIAL PRIMARY KEY,
      client_name TEXT NOT NULL,
      cover_type TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      source_agent TEXT NOT NULL DEFAULT '',
      date_received DATE NULL,
      date_sent_to_insurer DATE NULL,
      insurer TEXT NOT NULL DEFAULT '',
      date_received_from_insurer DATE NULL,
      status TEXT NOT NULL,
      policy_number TEXT NOT NULL DEFAULT '',
      premium NUMERIC(14, 2) NULL,
      sum_insured NUMERIC(14, 2) NULL,
      renewal_date DATE NULL,
      notes TEXT NOT NULL DEFAULT '',
      last_follow_up DATE NULL,
      follow_up_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations (status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quotations_date_received ON quotations (date_received);
  `);
}

async function seedQuotationsIfEmpty(pool, nextSerialId) {
  const countRes = await pool.query("SELECT COUNT(*)::int AS n FROM quotations");
  if (countRes.rows[0].n > 0) return;

  const seed = buildSeedQuotations();
  for (const row of seed) {
    const cols = bodyToDbColumns(row);
    if (typeof nextSerialId === "function") {
      const id = await nextSerialId(pool, "quotations");
      await pool.query(
        `INSERT INTO quotations (
          id, client_name, cover_type, contact_person, source_agent,
          date_received, date_sent_to_insurer, insurer, date_received_from_insurer,
          status, policy_number, premium, sum_insured, renewal_date, notes,
          last_follow_up, follow_up_history, status_history
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb
        )`,
        [
          id,
          cols.client_name,
          cols.cover_type,
          cols.contact_person,
          cols.source_agent,
          cols.date_received,
          cols.date_sent_to_insurer,
          cols.insurer,
          cols.date_received_from_insurer,
          cols.status,
          cols.policy_number,
          cols.premium,
          cols.sum_insured,
          cols.renewal_date,
          cols.notes,
          cols.last_follow_up,
          cols.follow_up_history,
          cols.status_history,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO quotations (
          client_name, cover_type, contact_person, source_agent,
          date_received, date_sent_to_insurer, insurer, date_received_from_insurer,
          status, policy_number, premium, sum_insured, renewal_date, notes,
          last_follow_up, follow_up_history, status_history
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb
        )`,
        [
          cols.client_name,
          cols.cover_type,
          cols.contact_person,
          cols.source_agent,
          cols.date_received,
          cols.date_sent_to_insurer,
          cols.insurer,
          cols.date_received_from_insurer,
          cols.status,
          cols.policy_number,
          cols.premium,
          cols.sum_insured,
          cols.renewal_date,
          cols.notes,
          cols.last_follow_up,
          cols.follow_up_history,
          cols.status_history,
        ]
      );
    }
  }
  console.log(`Seeded ${seed.length} quotations.`);
}

const QUOTATION_SNAPSHOT_COLUMNS = [
  "id",
  "client_name",
  "cover_type",
  "contact_person",
  "source_agent",
  "date_received",
  "date_sent_to_insurer",
  "insurer",
  "date_received_from_insurer",
  "status",
  "policy_number",
  "premium",
  "sum_insured",
  "renewal_date",
  "notes",
  "last_follow_up",
  "follow_up_history",
  "status_history",
  "created_by",
  "created_at",
  "updated_at",
];

function registerQuotationRoutes(app, deps) {
  const { pool, authRequired, nextSerialId, onPersist } = deps;

  app.get("/api/quotations", authRequired, async (_, res) => {
    try {
      const payload = await listQuotationsResponse(pool);
      return res.json(payload);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load quotations" });
    }
  });

  app.post("/api/quotations", authRequired, async (req, res) => {
    try {
      const body = quotationBodySchema.parse(req.body);
      const cols = bodyToDbColumns(body);
      const id = await nextSerialId(pool, "quotations");
      const result = await pool.query(
        `INSERT INTO quotations (
          id, client_name, cover_type, contact_person, source_agent,
          date_received, date_sent_to_insurer, insurer, date_received_from_insurer,
          status, policy_number, premium, sum_insured, renewal_date, notes,
          last_follow_up, follow_up_history, status_history, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19
        ) RETURNING *`,
        [
          id,
          cols.client_name,
          cols.cover_type,
          cols.contact_person,
          cols.source_agent,
          cols.date_received,
          cols.date_sent_to_insurer,
          cols.insurer,
          cols.date_received_from_insurer,
          cols.status,
          cols.policy_number,
          cols.premium,
          cols.sum_insured,
          cols.renewal_date,
          cols.notes,
          cols.last_follow_up,
          cols.follow_up_history,
          cols.status_history,
          req.user.id,
        ]
      );
      await onPersist?.();
      return res.status(201).json(rowToClient(result.rows[0]));
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: "Invalid quotation data", issues: err.issues });
      }
      console.error(err);
      return res.status(500).json({ message: "Failed to create quotation" });
    }
  });

  app.put("/api/quotations/:id", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid quotation id" });
      }
      const existing = await pool.query("SELECT * FROM quotations WHERE id = $1", [id]);
      if (!existing.rows[0]) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      const current = rowToClient(existing.rows[0]);
      const merged = { ...current, ...req.body };
      const body = quotationBodySchema.parse(merged);

      let statusHistory = merged.statusHistory || current.statusHistory || [];
      if (req.body.status && req.body.status !== current.status) {
        const stamp =
          req.body.lastFollowUp ||
          req.body.dateReceivedFromInsurer ||
          req.body.dateReceived ||
          new Date().toISOString().slice(0, 10);
        statusHistory = [...statusHistory, { date: stamp, status: req.body.status }];
      }

      const cols = bodyToDbColumns({ ...body, statusHistory });

      const result = await pool.query(
        `UPDATE quotations SET
          client_name = $2,
          cover_type = $3,
          contact_person = $4,
          source_agent = $5,
          date_received = $6,
          date_sent_to_insurer = $7,
          insurer = $8,
          date_received_from_insurer = $9,
          status = $10,
          policy_number = $11,
          premium = $12,
          sum_insured = $13,
          renewal_date = $14,
          notes = $15,
          last_follow_up = $16,
          follow_up_history = $17::jsonb,
          status_history = $18::jsonb,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [
          id,
          cols.client_name,
          cols.cover_type,
          cols.contact_person,
          cols.source_agent,
          cols.date_received,
          cols.date_sent_to_insurer,
          cols.insurer,
          cols.date_received_from_insurer,
          cols.status,
          cols.policy_number,
          cols.premium,
          cols.sum_insured,
          cols.renewal_date,
          cols.notes,
          cols.last_follow_up,
          cols.follow_up_history,
          cols.status_history,
        ]
      );
      await onPersist?.();
      return res.json(rowToClient(result.rows[0]));
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: "Invalid quotation data", issues: err.issues });
      }
      console.error(err);
      return res.status(500).json({ message: "Failed to update quotation" });
    }
  });

  app.post("/api/quotations/:id/follow-up", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { date, note } = z
        .object({ date: z.string().min(1), note: z.string().min(1) })
        .parse(req.body);

      const existing = await pool.query("SELECT * FROM quotations WHERE id = $1", [id]);
      if (!existing.rows[0]) {
        return res.status(404).json({ message: "Quotation not found" });
      }
      const current = rowToClient(existing.rows[0]);
      const followUpHistory = [...(current.followUpHistory || []), { date, note }];

      const result = await pool.query(
        `UPDATE quotations SET
          last_follow_up = $2,
          follow_up_history = $3::jsonb,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [id, date, JSON.stringify(followUpHistory)]
      );
      await onPersist?.();
      return res.json(rowToClient(result.rows[0]));
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: "Invalid follow-up data" });
      }
      console.error(err);
      return res.status(500).json({ message: "Failed to log follow-up" });
    }
  });

  app.delete("/api/quotations/:id", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await pool.query("DELETE FROM quotations WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) {
        return res.status(404).json({ message: "Quotation not found" });
      }
      await onPersist?.();
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to delete quotation" });
    }
  });

  app.post("/api/quotations/import", authRequired, async (req, res) => {
    try {
      const rows = z.array(quotationBodySchema).parse(req.body.quotations || req.body);
      await pool.query("BEGIN");
      try {
        await pool.query("DELETE FROM quotations");
        for (const row of rows) {
          const cols = bodyToDbColumns(row);
          const id = await nextSerialId(pool, "quotations");
          await pool.query(
            `INSERT INTO quotations (
              id, client_name, cover_type, contact_person, source_agent,
              date_received, date_sent_to_insurer, insurer, date_received_from_insurer,
              status, policy_number, premium, sum_insured, renewal_date, notes,
              last_follow_up, follow_up_history, status_history, created_by
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19
            )`,
            [
              id,
              cols.client_name,
              cols.cover_type,
              cols.contact_person,
              cols.source_agent,
              cols.date_received,
              cols.date_sent_to_insurer,
              cols.insurer,
              cols.date_received_from_insurer,
              cols.status,
              cols.policy_number,
              cols.premium,
              cols.sum_insured,
              cols.renewal_date,
              cols.notes,
              cols.last_follow_up,
              cols.follow_up_history,
              cols.status_history,
              req.user.id,
            ]
          );
        }
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
      await onPersist?.();
      const payload = await listQuotationsResponse(pool);
      return res.json(payload);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: "Invalid import data" });
      }
      console.error(err);
      return res.status(500).json({ message: "Failed to import quotations" });
    }
  });
}

module.exports = {
  ensureQuotationsTable,
  seedQuotationsIfEmpty,
  registerQuotationRoutes,
  QUOTATION_SNAPSHOT_COLUMNS,
  rowToClient,
};
