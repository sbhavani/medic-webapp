var async = require('async');

(function () {

  'use strict';

  var inboxServices = angular.module('inboxServices');

  inboxServices.factory('UpdateContact', ['SaveDoc', 'DbView', 'ClearFacilityCache',
    function(SaveDoc, DbView, ClearFacilityCache) {

      var updateChildren = function(parent, callback) {
        if (parent.type === 'person') {
          // persons don't have children - we're done
          return callback();
        }

        var options = { params: {
          startkey: [ parent._id ],
          endkey: [ parent._id, {} ],
          include_docs: true
        } };
        DbView('facility_by_parent', options, function(err, children) {
          if (err) {
            return callback(err);
          }
          async.each(
            children,
            function(child, callback) {
              if (child.parent._id === parent._id && child.parent._rev === parent._rev) {
                // nothing to update
                return callback();
              }
              SaveDoc(child._id, { parent: parent }, function(err, updated) {
                if (err) {
                  return callback(err);
                }
                updateChildren(updated, callback);
              });
            },
            callback
          );
        });
      };

      var updateParents = function(contact, callback) {
        var options = { params: {
          startkey: [ contact._id ],
          endkey: [ contact._id, {} ],
          include_docs: true
        } };
        DbView('facilities_by_contact', options, function(err, parents) {
          if (err) {
            return callback(err);
          }
          async.each(
            parents,
            function(parent, callback) {
              if (parent.contact._id === contact._id && parent.contact._rev === contact._rev) {
                // nothing to update
                return callback();
              }
              // delete the parent to avoid infinite loops
              delete contact.parent;
              SaveDoc(parent._id, { contact: contact }, callback);
            },
            callback
          );
        });
      };

      return function(id, updates, callback) {
        if (!callback) {
          callback = updates;
          updates = id;
          id = null;
        }

        if (updates.contact) {
          // null out the contact's parent to avoid infinite loops
          delete updates.contact.parent;
        }

        SaveDoc(id, updates, function(err, doc) {
          if (err) {
            return callback(err);
          }
          var updateFn = doc.type === 'person' ? updateParents : updateChildren;
          updateFn(doc, function(err) {
            ClearFacilityCache();
            callback(err, doc);
          });
        });
      };
    }
  ]);

}());