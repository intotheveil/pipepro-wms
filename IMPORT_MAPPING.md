# PipePro WMS — Excel Import Mapping Spec
# Generated from actual Excel file analysis
# Use this file when building the import wizard in Claude Code

---

## FILE 1: WMS___Projects___Reference.xlsx → Sheet: ISO REGISTER
**Maps to Supabase table: iso_register**
Header row: Row 1 (row 0 is a title row)

| Excel Column | Supabase Column | Notes |
|---|---|---|
| PROJECT_ID | (skip — use context project_id) | |
| Fast Number | fast_no | text |
| ISO DRAWING | drawing_no | text |
| MATERIAL | material | text |
| SHEET No | sheet | text |
| REV | revision | text |
| FLUID CODE | fluid_code | text |
| SERVICE | system | maps to system field |
| PIPING CLASS | piping_class | text |
| SCH | (skip or notes) | schedule |
| SIZE (NPS) | size_nps | text |
| PED | ped_category | text: I/II/III/IV |
| RT % | (skip — comes from ndt_matrix) | |
| TOTAL JOINTS | (skip — computed from weld_log) | |
| DRAWING FILE | (skip — goes to documents table) | |
| DELIVERED DATE | (skip or notes) | |
| STATUS | status | NOT_STARTED/IN_PROGRESS/COMPLETE/ON_HOLD |
| NOTES | notes | text |

---

## FILE 2: WMS___Projects___Reference.xlsx → Sheet: WELDER REGISTER
**Maps to Supabase table: welders**
Header row: Row 1

| Excel Column | Supabase Column | Notes |
|---|---|---|
| PROJECT_ID | (skip — use context) | |
| WELDER ID / STAMP | stamp | text |
| FULL NAME | name | text |
| NATIONALITY | (skip or notes) | |
| WPS / PROCESS QUAL. | qualified_wps | text[] — split by comma/newline |
| MATERIAL GROUPS | (notes) | |
| THICKNESS RANGE | (notes) | |
| DIAMETER RANGE | (notes) | |
| POSITION QUAL. | (notes) | |
| CERT. NO. | (notes) | |
| CERT. DATE | (notes) | |
| EXPIRY DATE | qualification_exp | date |
| STATUS | active | 'ACTIVE' → true, else false |
| REMARKS | (notes) | |

---

## FILE 3: WMS___Projects___Reference.xlsx → Sheet: WPS REGISTER
**Maps to Supabase table: wps_list**
Header row: Row 1

| Excel Column | Supabase Column | Notes |
|---|---|---|
| WPS REF. | wps_no | text |
| PROCESS | process | text e.g. SMAW/GTAW |
| BASE MATERIAL GROUP | p_numbers | text |
| FILLER MATERIAL | (notes) | |
| THICKNESS RANGE | thickness_range | text |
| DIAMETER RANGE | (notes) | |
| POSITION | position | text |
| PREHEAT TEMP MIN | (notes) | |
| PWHT REQUIRED | (notes) | |
| PQR REF. | (notes) | |
| APPROVAL BODY | (notes) | |
| REMARKS | (notes) | |

---

## IMPORT ORDER (dependency sequence)
1. WPS REGISTER → wps_list
2. ISO REGISTER → iso_register
3. WELDER REGISTER → welders

---

## KEY PARSING RULES

### Dates
- Excel dates come as serial numbers or strings like '2026-03-24 00:00:00'
- NEVER use new Date() in JS — use split('-') parsing

### Boolean columns
- 'Y' / 'YES' / 'y' / 'ACTIVE' → true
- 'N' / 'NO' / '' / null → false

### Status mapping
- 'NOT STARTED' → 'NOT_STARTED'
- 'IN PROGRESS' → 'IN_PROGRESS'
- 'COMPLETE' / 'COMPLETED' → 'COMPLETE'
- 'ON HOLD' / 'HOLD' → 'ON_HOLD'

### Header row detection
- ISO REGISTER: header at row index 1 (0-indexed)
- WELDER REGISTER: header at row index 1
- WPS REGISTER: header at row index 1

### Project ID
- Excel rows contain PROJECT_ID like 'KD-0025-028'
- Always use project.id (UUID) from context — never store the text code
