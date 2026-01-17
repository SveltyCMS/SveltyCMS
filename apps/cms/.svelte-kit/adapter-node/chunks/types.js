var PermissionAction = /* @__PURE__ */ ((PermissionAction2) => {
	PermissionAction2['CREATE'] = 'create';
	PermissionAction2['READ'] = 'read';
	PermissionAction2['UPDATE'] = 'update';
	PermissionAction2['DELETE'] = 'delete';
	PermissionAction2['WRITE'] = 'write';
	PermissionAction2['MANAGE'] = 'manage';
	PermissionAction2['SHARE'] = 'share';
	PermissionAction2['ACCESS'] = 'access';
	PermissionAction2['EXECUTE'] = 'execute';
	return PermissionAction2;
})(PermissionAction || {});
var PermissionType = /* @__PURE__ */ ((PermissionType2) => {
	PermissionType2['COLLECTION'] = 'collection';
	PermissionType2['USER'] = 'user';
	PermissionType2['CONFIGURATION'] = 'configuration';
	PermissionType2['SYSTEM'] = 'system';
	PermissionType2['API'] = 'api';
	return PermissionType2;
})(PermissionType || {});
export { PermissionType as P, PermissionAction as a };
//# sourceMappingURL=types.js.map
