BANK PAYMENT DOCUMENT TEMPLATES
================================

Place the company Word templates here:
- ZHEJIANG FUSHENGDA.docx  (for GFPL / Gujarat Flotex Pvt Ltd)
- Templategtex.docx        (for GTEX Fabrics)

Copy these from your Import Payment Bank Documents Generator app folder if needed.


PLACEHOLDER RULES (required for correct generation)
----------------------------------------------------

1. Use SINGLE curly braces only

   In the template use:   { tag_name }
   Do NOT use:            {{ tag_name }}

   Example:  Payment to { beneficiary_name }


2. Exact tag names (copy exactly; spelling and underscores must match)

   What you want in the document          | Put this in the template
   --------------------------------------|--------------------------------
   Supplier / beneficiary name           | { beneficiary_name }
   Beneficiary address                   | { beneficiary_address }
   Beneficiary country                   | { beneficiary_country }
   Beneficiary account number            | { beneficiary_account }
   Bank name                             | { bank_name }
   Bank SWIFT code                       | { bank_swift }
   Bank branch address                   | { bank_address }
   Date (e.g. application date)          | { date }
   Invoice number                        | { invoice_no }
   Invoice date                          | { invoice_date }
   Shipment date                         | { shipment_date }
   Currency (e.g. USD)                   | { currency }
   Amount (numeric, e.g. 1,234.56)       | { amount }
   Amount in words                       | { amount_in_words }
   Total invoice value (if different)     | { invoice_amount }
   Quantity (e.g. 100 KGS)               | { quantity }
   Port of loading                       | { port_loading }
   Port of discharge                     | { port_discharge }
   Purpose of remittance                 | { purpose }
   Goods description                     | { goods_desc }
   HSN code                              | { hsn_code }
   IncoTerm (e.g. CIF, FOB)              | { term }
   Mode of shipment (e.g. SEA, AIR)      | { mode_shipment }
   Document checklist list               | { document_list }
   Currency and amount together          | { currency_and_amount }
     (e.g. "USD 1,234.56")


FORM A1 SECTION B TABLE (one row per product)
----------------------------------------------

When the shipment has multiple products, the document shows one table row per product
with product-wise amount. Use a docxtemplater loop so the row repeats for each item.

1. In SECTION B, select the single data row of the table (the row with placeholders).

2. Wrap that row in a loop:
   - Before the row:  {#items}
   - After the row:   {/items}

3. Inside the row, use these tags (they refer to the current product/row):
   - Description of goods    | { description }  or  { goods_desc }
   - HSN code                | { hsn_code }
   - Quantity + unit          | { quantity_and_unit }  or  { quantity } and { unit }
   - Amount (product-wise)   | { amount }   <-- this is the row amount, not the total

4. Same in every row (repeated for convenience; you can use these from the row or from the main context):
   - Invoice number          | { invoice_no }
   - Invoice date            | { invoice_date }
   - Term                    | { term }
   - Currency                | { currency }
   - Beneficiary country     | { beneficiary_country }
   - Mode of shipment        | { mode_shipment }
   - Shipment date           | { shipment_date }

5. Rest of document (header, remittance, declarations): keep using { invoice_amount }
   and { amount } for the TOTAL. Only inside the SECTION B table use the loop so each
   row shows its own product-wise { amount }.


3. Step-by-step in Word (to fix existing templates)

   - Open the template .docx in Word.
   - Find (Ctrl+F):  {{   and Replace with:  {
   - Find:  }}   and Replace with:  }
   - Ensure each tag is one word (use underscores), e.g. beneficiary_name not "beneficiary name".
   - Save and place back in this folder.


4. One tag per placeholder

   Use { invoice_no } and { invoice_date } in separate places, not { invoice_no invoice_date }.


5. Run the fix script (optional)

   To convert all {{ }} to { } in every .docx in this folder without opening Word:

     node server/scripts/fix-template-braces.js

   Or for a single file:

     node server/scripts/fix-template-braces.js "path\to\your\template.docx"
