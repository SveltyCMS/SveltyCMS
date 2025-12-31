// tests/bun/collection-builder.test.ts
import type { WidgetConfig } from '../../src/widgets/widgetFactory';
import { createWidget } from '../../src/widgets/widgetFactory';
import { beforeEach, describe, expect, test } from 'bun:test';

// Mock widget store data
const mockWidgetStore = {
	widgetFunctions: {} as Record<string, ReturnType<typeof createWidget>>,
	activeWidgets: [] as string[]
};

describe('Collection Builder Widget Integration', () => {
	beforeEach(() => {
		// Reset mock store
		mockWidgetStore.widgetFunctions = {};
		mockWidgetStore.activeWidgets = [];
	});

	describe('Widget Selection', () => {
		test('should filter widgets by active status', () => {
			// Setup mock widgets
			const widget1Config: WidgetConfig = {
				Name: 'ActiveWidget',
				Icon: 'active-icon',
				Description: 'Active widget',
				validationSchema: {}
			};

			const widget2Config: WidgetConfig = {
				Name: 'InactiveWidget',
				Icon: 'inactive-icon',
				Description: 'Inactive widget',
				validationSchema: {}
			};

			const activeWidget = createWidget(widget1Config);
			const inactiveWidget = createWidget(widget2Config);

			// Mock widget store state
			mockWidgetStore.widgetFunctions = {
				ActiveWidget: activeWidget,
				InactiveWidget: inactiveWidget
			};
			mockWidgetStore.activeWidgets = ['ActiveWidget']; // Only one is active

			// Test filtering logic (simulating ModalSelectWidget behavior)
			const availableWidgets = Object.keys(mockWidgetStore.widgetFunctions);
			const filteredWidgets = availableWidgets.filter((key) => mockWidgetStore.activeWidgets.includes(key));

			expect(availableWidgets).toHaveLength(2);
			expect(filteredWidgets).toHaveLength(1);
			expect(filteredWidgets).toContain('ActiveWidget');
			expect(filteredWidgets).not.toContain('InactiveWidget');
		});

		test('should handle widget search functionality', () => {
			// Setup mock widgets
			type WidgetMap = Record<string, ReturnType<typeof createWidget>>;
			const widgets: WidgetMap = {
				TextInput: createWidget({ Name: 'TextInput', Description: 'Text input widget', validationSchema: {} }),
				NumberInput: createWidget({ Name: 'NumberInput', Description: 'Number input widget', validationSchema: {} }),
				EmailInput: createWidget({ Name: 'EmailInput', Description: 'Email input widget', validationSchema: {} }),
				FileUpload: createWidget({ Name: 'FileUpload', Description: 'File upload widget', validationSchema: {} })
			};

			mockWidgetStore.widgetFunctions = widgets;
			mockWidgetStore.activeWidgets = Object.keys(widgets);

			// Test search functionality (simulating ModalSelectWidget search)
			const searchTerm = 'input';
			const filteredBySearch = Object.keys(widgets).filter(
				(key) => key.toLowerCase().includes(searchTerm.toLowerCase()) || widgets[key].Description?.toLowerCase().includes(searchTerm.toLowerCase())
			);

			expect(filteredBySearch).toHaveLength(3);
			expect(filteredBySearch).toContain('TextInput');
			expect(filteredBySearch).toContain('NumberInput');
			expect(filteredBySearch).toContain('EmailInput');
			expect(filteredBySearch).not.toContain('FileUpload');
		});
	});

	describe('Widget Configuration', () => {
		test('should access widget GUI schema for forms', () => {
			const widgetConfig: WidgetConfig = {
				Name: 'ConfigurableWidget',
				Description: 'Widget with configuration options',
				validationSchema: {},
				GuiSchema: {
					properties: {
						label: { type: 'string', title: 'Label' },
						required: { type: 'boolean', title: 'Required' },
						placeholder: { type: 'string', title: 'Placeholder' },
						maxlength: { type: 'number', title: 'Max Length' }
					}
				}
			};

			const widget = createWidget(widgetConfig);
			mockWidgetStore.widgetFunctions['ConfigurableWidget'] = widget;

			// Test GUI schema access (simulating ModalWidgetForm behavior)
			const guiSchema = widget.GuiSchema;
			expect(guiSchema).toBeDefined();
			expect(guiSchema?.properties).toBeDefined();

			const properties = guiSchema?.properties as Record<string, unknown>;
			expect(properties.label).toBeDefined();
			expect(properties.required).toBeDefined();
			expect(properties.placeholder).toBeDefined();
			expect(properties.maxlength).toBeDefined();

			// Test property filtering (removing standard fields)
			const standardFields = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];
			const specificOptions = Object.keys(properties).filter((option) => !standardFields.includes(option));

			expect(specificOptions).toContain('placeholder');
			expect(specificOptions).toContain('maxlength');
			expect(specificOptions).not.toContain('label');
			expect(specificOptions).not.toContain('required');
		});

		test('should create field instances with proper configuration', () => {
			const widgetConfig: WidgetConfig = {
				Name: 'TestWidget',
				Icon: 'test-icon',
				Description: 'Test widget for field creation',
				validationSchema: {}
			};

			const widget = createWidget(widgetConfig);

			// Test field instance creation (simulating collection builder field creation)
			const fieldInstance = widget({
				label: 'User Name',
				db_fieldName: 'user_name',
				required: true,
				translated: false,
				placeholder: 'Enter your name',
				maxlength: 50
			});

			expect(fieldInstance.label).toBe('User Name');
			expect(fieldInstance.db_fieldName).toBe('user_name');
			expect(fieldInstance.required).toBe(true);
			expect(fieldInstance.translated).toBe(false);
			expect(fieldInstance.placeholder).toBe('Enter your name');
			expect(fieldInstance.maxlength).toBe(50);
			expect(fieldInstance.widget.Name).toBe('TestWidget');
		});
	});

	describe('Widget Management Integration', () => {
		test('should handle widget activation/deactivation', () => {
			const widgets = {
				Widget1: createWidget({ Name: 'Widget1', Description: 'First widget', validationSchema: {} }),
				Widget2: createWidget({ Name: 'Widget2', Description: 'Second widget', validationSchema: {} })
			};

			mockWidgetStore.widgetFunctions = widgets;
			mockWidgetStore.activeWidgets = ['Widget1']; // Only Widget1 is active

			// Test that only active widgets are available for collection builder
			const availableForCollections = Object.keys(widgets).filter((key) => mockWidgetStore.activeWidgets.includes(key));

			expect(availableForCollections).toHaveLength(1);
			expect(availableForCollections).toContain('Widget1');

			// Simulate activating Widget2
			mockWidgetStore.activeWidgets.push('Widget2');

			const updatedAvailable = Object.keys(widgets).filter((key) => mockWidgetStore.activeWidgets.includes(key));

			expect(updatedAvailable).toHaveLength(2);
			expect(updatedAvailable).toContain('Widget2');
		});
	});

	describe('Collection Building Workflow', () => {
		test('should support complete field creation workflow', () => {
			// Setup a realistic widget
			const textWidgetConfig: WidgetConfig = {
				Name: 'TextInput',
				Icon: 'text-icon',
				Description: 'Text input widget',
				inputComponentPath: '/src/widgets/core/input/Input.svelte',
				validationSchema: {},
				GuiSchema: {
					properties: {
						label: { type: 'string' },
						required: { type: 'boolean' },
						placeholder: { type: 'string' },
						minlength: { type: 'number' },
						maxlength: { type: 'number' }
					}
				}
			};

			const textWidget = createWidget(textWidgetConfig);
			mockWidgetStore.widgetFunctions['TextInput'] = textWidget;
			mockWidgetStore.activeWidgets = ['TextInput'];

			// Simulate collection builder workflow:
			// 1. User selects widget
			const selectedWidget = 'TextInput';
			expect(mockWidgetStore.activeWidgets).toContain(selectedWidget);

			// 2. System provides configuration options
			const widget = mockWidgetStore.widgetFunctions[selectedWidget];
			const configOptions = widget.GuiSchema?.properties || {};
			expect(Object.keys(configOptions)).toContain('placeholder');
			expect(Object.keys(configOptions)).toContain('maxlength');

			// 3. User configures field
			const fieldConfig = {
				label: 'Article Title',
				db_fieldName: 'title',
				required: true,
				placeholder: 'Enter article title',
				maxlength: 100
			};

			// 4. System creates field instance
			const fieldInstance = widget(fieldConfig);

			expect(fieldInstance.label).toBe('Article Title');
			expect(fieldInstance.db_fieldName).toBe('title');
			expect(fieldInstance.required).toBe(true);
			expect(fieldInstance.placeholder).toBe('Enter article title');
			expect(fieldInstance.maxlength).toBe(100);
			expect(fieldInstance.widget.Name).toBe('TextInput');
			expect(fieldInstance.widget.inputComponentPath).toBe('/src/widgets/core/input/Input.svelte');
		});

		test('should validate field configuration', () => {
			const widgetConfig: WidgetConfig = {
				Name: 'ValidatedWidget',
				Description: 'Widget with validation',
				validationSchema: {}
			};

			const widget = createWidget(widgetConfig);

			// Test that required fields are validated
			const fieldInstance = widget({
				label: 'Test Field',
				db_fieldName: 'test_field'
			});

			expect(fieldInstance.label).toBeDefined();
			expect(fieldInstance.db_fieldName).toBeDefined();
			expect(fieldInstance.widget).toBeDefined();
		});
	});
});
