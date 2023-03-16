import type { Table } from '@tanstack/svelte-table';
import { Workbook } from 'exceljs';
import { saveAs } from 'file-saver';

export default async function exportExcel(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	table: Table<any>,
	filename: string,
	applyFilters = true
) {
	const wb = new Workbook();
	const ws = wb.addWorksheet('Sheet 1');

	// get columns
	const lastHeaderGroup = table.getHeaderGroups().at(-1);
	if (!lastHeaderGroup) {
		console.error('No header groups found', table.getHeaderGroups());
		return;
	}

	// define visible columns of table
	ws.columns = lastHeaderGroup.headers
		.filter((h) => h.column.getIsVisible())
		.map((header) => {
			return {
				header: header.column.columnDef.header as string,
				key: header.id,
				width: 20
			};
		});

	// get filtered or all rows
	const exportRows = applyFilters ? table.getFilteredRowModel().rows : table.getCoreRowModel().rows;

	exportRows.forEach((row) => {
		const cells = row.getVisibleCells();
		const values = cells.map((cell) => cell.getValue() ?? '');
		console.log('values', values);
		ws.addRow(values);
	});

	// make first row bold
	ws.getRow(1).eachCell((cell) => {
		cell.font = { bold: true };
	});

	// for csv: await wb.csv.writeBuffer();
	const buf = await wb.xlsx.writeBuffer();
	saveAs(new Blob([buf]), `${filename}.xlsx`);
}
