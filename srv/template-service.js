const cds = require('@sap/cds');
const XLSX = require('xlsx');

module.exports = cds.service.impl(async function() {
    
    this.on('downloadTemplate', async (req) => {
        const {templateID, exportMode} = req.data;
        
        // 1. Fetch template with all mapping details
        const template = await SELECT.one.from('TemplateMaster')
        .where({ID : templateID})
        .columns(t => { 
            t.templateName, 
            t.mappings(m => {
                m('*'),
                m.field(f => {
                    f('*')
                })
         })  
        });

        // 2. Validation
        if(!template || !template.mappings) {
            return req.error(404, 'Template not found');
        }

        // 3. Transform field data with all properties
        const aExcelData = template.mappings.map(m  => {
            return {
               "Field Name" : m.field.fieldName,
               "Level" : m.field.levelName,
               "SAP Type" : m.field.sapType,
               "Field Length" : m.field.fieldLength,
               "Property Type" : m.field.propertyType,
               "Is Required" : m.field.isRequired ? 'Yes' : 'No'
            }
        });

        // 4. Create a new workbook
        const oWorkbook = XLSX.utils.book_new();

        if(exportMode === 'SINGLE') {
            const oWorksheet = XLSX.utils.json_to_sheet(aExcelData);
            XLSX.utils.book_append_sheet(oWorkbook, oWorksheet, 'Template');
            
        } else if (exportMode === 'MULTIPLE') {
            // Group data by level
            const oGroupedData = {};
            
            aExcelData.forEach(row => {
                const level = row["Level"] || "Unassigned";
                
                if(!oGroupedData[level]) { 
                    oGroupedData[level] = [];
                }
                oGroupedData[level].push(row); 
            });
            
            // Create separate sheet for each level with proper capitalization
            const levelOrder = ['HEADER', 'PAYMENT', 'CLEARING'];
            
            for (const levelName of levelOrder) {
                if(oGroupedData[levelName]) {
                    const oSheet = XLSX.utils.json_to_sheet(oGroupedData[levelName]);
                    const displayName = levelName.charAt(0) + levelName.slice(1).toLowerCase();
                    XLSX.utils.book_append_sheet(oWorkbook, oSheet, displayName);
                }
            }
        }

        // 5. Convert to binary and send to browser
        const buffer = XLSX.write(oWorkbook, { type : 'buffer', bookType : 'xlsx'});

        // Set response headers for file download
        req._.res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        req._.res.setHeader('Content-Disposition', `attachment; filename="${template.templateName}_Configuration.xlsx"`);
        
        return req._.res.send(buffer);
        
    }); // <-- Closes this.on

}); // <-- Closes module.exports