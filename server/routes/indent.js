const express = require('express');
const { generateDocxBuffer } = require('../indentDocGenerator');
const { INDENT_COMPANY_DB } = require('../config');

function createRouter() {
  const router = express.Router();

  router.get('/companies', (req, res) => {
    res.json({ companies: Object.keys(INDENT_COMPANY_DB) });
  });

  router.post('/generate', async (req, res) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body required' });
      }
      const buffer = await generateDocxBuffer(data);
      const companyPrefix = (data.company || 'Indent').slice(0, 4).replace(/\s/g, '');
      const ref = (data.ourRef || 'Ref').replace(/[/\\?*:]/g, '_');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${companyPrefix}_${ref}_${ts}_Indent.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('Indent generate error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to generate document' });
    }
  });

  return router;
}

module.exports = createRouter;
