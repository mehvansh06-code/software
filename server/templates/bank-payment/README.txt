BANK PAYMENT DOCUMENT TEMPLATES
================================

IMPORTANT: Generated files must open in Word
--------------------------------------------
- The generator does NOT modify the template XML (so Word can always open the output).
- If your generated document OPENS but many fields are BLANK: Word has split each
  placeholder into several "runs". Fix the template once in Word:
  1. Open the template .docx (e.g. ZHEJIANG FUSHENGDA.docx) in Microsoft Word.
  2. For EACH placeholder (e.g. "Date: - { date }"):
     - Select the whole placeholder text including the braces: { date }
     - Cut (Ctrl+X), then Paste (Ctrl+V). This makes it one run so the generator can fill it.
  3. Repeat for every placeholder (beneficiary_name, amount, bank_swift, etc.).
  4. Save the template. Generate again - the new .docx will open AND show filled fields.
- The two fields that always show ("ADVANCE BY SWIFT", "0801010128") are static text in the template.

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
   IBAN (optional)                       | { iban }  or  { IBAN }
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

   Intermediary bank (optional)
   --------------------------------------|--------------------------------
   Intermediary bank name                 | { intermediary_bank_name }
   Intermediary bank SWIFT                | { intermediary_bank_swift }
   Intermediary bank address              | { intermediary_bank_address }
   Intermediary bank country              | { intermediary_bank_country }


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

   If generated documents show blank fields, Word may have split a placeholder across
   multiple "runs". Fix in Word: select the placeholder (e.g. { date }), cut (Ctrl+X),
   then paste (Ctrl+V) so it becomes one run; or retype the placeholder in one go.
   Do not use automated run-merge scripts on the .docx—they can corrupt the file.


5. Run the fix script (optional)

   To convert all {{ }} to { } in every .docx in this folder without opening Word:

     node server/scripts/fix-template-braces.js

   Or for a single file:

     node server/scripts/fix-template-braces.js "path\to\your\template.docx"
