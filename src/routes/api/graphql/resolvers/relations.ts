export const relationResolvers = {
  RelationWidgetField: {
    resolvedEntry: async (
      parent: { author: string; targetCollection: string },
      _args: any,
      context: any,
    ) => {
      if (!parent.author) return null;

      // Zero-allocation batch request execution gateway
      return context.relationLoader.load({
        id: parent.author,
        collection: parent.targetCollection,
      });
    },
  },
};
