# Excel import format

Use **Import from Excel** on each master screen to bulk-load data. Fill your Excel file with the columns below (first row = headers), then upload.

---

## Import domain

### Suppliers (Supplier Master)

| Column | Required | Description |
|--------|----------|-------------|
| Name | Yes | Supplier / legal name |
| Country | Yes | Country |
| Address | No | Address |
| Bank Name | No | Bank name |
| Account Holder | No | Account holder name |
| Account Number | No | Bank account number |
| SWIFT Code | No | SWIFT/BIC |
| Bank Address | No | Bank address |
| Contact Person | No | Contact name |
| Contact Number | No | Phone |
| Contact Email | No | Email |

**Template:** Use **Download template** on Supplier Master to get `suppliers_import_template.xlsx`.

---

### Materials (Materials Master)

| Column | Required | Description |
|--------|----------|-------------|
| Name | Yes | Material name |
| Description | No | Short description |
| HSN Code | No | HSN code |
| Unit | No | Default KGS |
| Type | No | RAW_MATERIAL or CAPITAL_GOOD |

**Template:** Use **Download template** on Materials Master to get `materials_import_template.xlsx`.

---

### Import Shipments (Shipment Master – Import)

| Column | Required | Description |
|--------|----------|-------------|
| Supplier ID | Yes* | Existing supplier ID (see **How to fill IDs** below), or leave blank and use Supplier Name |
| Supplier Name | Yes* | Supplier name — must match exactly the name in Supplier Master |
| Invoice No | Yes | Invoice number |
| Company | No | GFPL or GTEX (default GFPL) |
| Currency | No | Default USD |
| Exchange Rate | No | Default 1 |
| Product Name | Yes | Product / line description |
| HSN Code | No | HSN code |
| Quantity | No | Quantity (number) |
| Unit | No | Default KGS |
| Rate | No | Rate per unit |
| Amount | No | Line amount (or Quantity × Rate) |
| Expected Shipment Date | No | YYYY-MM-DD |
| Invoice Date | No | YYYY-MM-DD |

*At least one of Supplier ID or Supplier Name is required. If you use Supplier Name, it must match an existing supplier in the app.

**Template:** Use **Download template** on Shipment Master (Import) to get `shipments_import_template.xlsx`.

---

## Export domain

### Buyers (Buyer Master)

| Column | Required | Description |
|--------|----------|-------------|
| Name | Yes | Buyer / legal name |
| Country | Yes | Country |
| Address | No | Address |
| Bank Name | No | Bank name |
| Account Holder | No | Account holder name |
| Account Number | No | Bank account number |
| SWIFT Code | No | SWIFT/BIC |
| Bank Address | No | Bank address |
| Contact Person | No | Contact name |
| Contact Number | No | Phone |
| Contact Email | No | Email |
| Sales Person Name | No | Sales person |
| Sales Person Contact | No | Sales contact |
| Consignee Name | No | Consignee name |
| Consignee Address | No | Consignee / shipping address |

**Template:** Use **Download template** on Buyer Master to get `buyers_import_template.xlsx`.

---

### Export Shipments (Shipment Master – Export)

| Column | Required | Description |
|--------|----------|-------------|
| Buyer ID | Yes* | Existing buyer ID (see **How to fill IDs** below), or leave blank and use Buyer Name |
| Buyer Name | Yes* | Buyer name — must match exactly the name in Buyer Master |
| Invoice No | Yes | Invoice number |
| Company | No | GFPL or GTEX (default GFPL) |
| Currency | No | Default USD |
| Exchange Rate | No | Default 1 |
| Product Name | Yes | Product / line description |
| HSN Code | No | HSN code |
| Quantity | No | Quantity (number) |
| Unit | No | Default KGS |
| Rate | No | Rate per unit |
| Amount | No | Line amount (or Quantity × Rate) |
| Expected Shipment Date | No | YYYY-MM-DD |
| Invoice Date | No | YYYY-MM-DD |

*At least one of Buyer ID or Buyer Name is required. If you use Buyer Name, it must match an existing buyer in the app.

**Template:** Use **Download template** on Shipment Master (Export) to get `shipments_export_template.xlsx`.

---

## How to fill Supplier ID and Buyer ID (for shipment import)

You have two options; you don’t need both.

1. **Use Name only (easiest)**  
   Leave **Supplier ID** (import) or **Buyer ID** (export) blank. Fill **Supplier Name** or **Buyer Name** with the **exact** name as it appears in Supplier Master or Buyer Master. The app will look up the ID by name.

2. **Use ID**  
   - Open **Supplier Master** (import) or **Buyer Master** (export).  
   - Click the **eye (View)** icon on a row.  
   - In the details popup, **Supplier ID** or **Buyer ID** is shown at the top — copy it and paste into your Excel in the Supplier ID / Buyer Name column.

Names are matched exactly (case-sensitive). If a row is skipped, check that the name in Excel matches the master exactly (no extra spaces, same spelling).
