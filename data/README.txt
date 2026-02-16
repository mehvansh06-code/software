Put your Excel files here for import, then run:

  node server/import-from-file.js

Or from another folder:

  node server/import-from-file.js "C:\path\to\your\folder"

File names (import type):
  - suppliers.xlsx  or  suppliers_*.xlsx  -> suppliers
  - buyers.xlsx     or  buyers_*.xlsx     -> buyers  
  - materials.xlsx  or  materials_*.xlsx  -> materials

Use the same column headers as the app (Name, Country, Address, Bank Name, Account Holder, Account Number, SWIFT Code, etc.).
