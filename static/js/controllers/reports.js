var _ = require('underscore'),
    modal = require('../modules/modal'),
    scrollLoader = require('../modules/scroll-loader');

(function () {

  'use strict';

  var inboxControllers = angular.module('inboxControllers');

  inboxControllers.controller('ReportsCtrl', 
    ['$scope', '$rootScope', '$state', '$stateParams', '$timeout', 'translateFilter', 'Settings', 'MarkRead', 'Search', 'Changes', 'EditGroup',
    function ($scope, $rootScope, $state, $stateParams, $timeout, translateFilter, Settings, MarkRead, Search, Changes, EditGroup) {

      $scope.filterModel.type = 'reports';
      $scope.selectedGroup = undefined;
      $scope.setReports();

      $scope.setSelectedGroup = function(group) {
        $scope.selectedGroup = angular.copy(group);
      };

      $scope.updateGroup = function(group) {
        var pane = modal.start($('#edit-message-group'));
        EditGroup($scope.selected._id, group, function(err) {
          pane.done(translateFilter('Error updating group'), err);
        });
      };

      var _merge = function(to, from) {
        if (from._rev !== to._rev) {
          for (var prop in from) {
            if (from.hasOwnProperty(prop)) {
              to[prop] = from[prop];
            }
          }
        }
      };

      $scope.update = function(updated) {
        _.each(updated, function(newMsg) {
          if ($scope.selected && $scope.selected._id === newMsg._id) {
            _merge($scope.selected, newMsg);
          }
          var oldMsg = _.findWhere($scope.items, { _id: newMsg._id });
          if (oldMsg) {
            _merge(oldMsg, newMsg);
            if (!$scope.selected && $stateParams.id === oldMsg._id) {
              _setSelected(oldMsg);
            }
          } else {
            $scope.items.push(newMsg);
          }
        });
      };

      var _setSelected = function(message) {
        $scope.setSelected(message);
        if (!$scope.isRead(message)) {
          $scope.readStatus.forms--;
        }
        MarkRead(message._id, true, function(err) {
          if (err) {
            console.log(err);
          }
        });
      };

      $scope.selectMessage = function(id) {
        if ($scope.selected && $scope.selected._id && $scope.selected._id === id) {
          return;
        }
        $scope.setSelected();
        if (id && $scope.items) {
          $scope.setLoadingContent(id);
          var message = _.findWhere($scope.items, { _id: id });
          if (message) {
            _setSelected(message);
          } else {
            var options = {
              changes: [ { id: id } ],
              ignoreFilter: true
            };
            Search($scope, options, function(err, data) {
              if (err) {
                return console.log(err);
              }
              if (data.results.length) {
                _setSelected(data.results[0]);
                _initScroll();
              }
            });
          }
        }
      };

      var _deleteMessage = function(message) {
        if ($scope.selected && $scope.selected._id === message.id) {
          $scope.setSelected();
        }
        for (var i = 0; i < $scope.items.length; i++) {
          if (message.id === $scope.items[i]._id) {
            $scope.items.splice(i, 1);
            return;
          }
        }
      };

      $scope.query = function(options) {
        options = options || {};
        if (options.changes) {
          $scope.updateReadStatus();
          var deletedRows = _.where(options.changes, { deleted: true });
          _.each(deletedRows, _deleteMessage);
          if (deletedRows.length === options.changes.length) {
            // nothing to update
            return;
          }
          options.changes = _.filter(options.changes, function(change) {
            return !change.deleted;
          });
        } else if ($('#back').is(':visible')) {
          $scope.selectMessage();
        }
        if (!options.silent) {
          $scope.error = false;
          $scope.errorSyntax = false;
          $scope.loading = true;
        }
        if (options.skip) {
          $scope.appending = true;
          options.skip = $scope.items.length;
        } else if (!options.silent) {
          $scope.setReports([]);
        }

        Search($scope, options, function(err, data) {
          $scope.loading = false;
          $scope.appending = false;
          if (err) {
            $scope.error = true;
            if ($scope.filterQuery.value &&
                err.reason &&
                err.reason.toLowerCase().indexOf('bad query syntax') !== -1) {
              // invalid freetext filter query
              $scope.errorSyntax = true;
            }
            return console.log('Error loading messages', err);
          }
          $scope.error = false;
          $scope.errorSyntax = false;

          $scope.update(data.results);
          if (!options.changes) {
            $scope.totalItems = data.total_rows;
          }
          if (!options.changes && !options.skip) {
            if (!data.results.length) {
              $scope.selectMessage();
            } else {
              var curr = _.find(data.results, function(result) {
                return result._id === $state.params.id;
              });
              if (curr) {
                $scope.setSelected(curr);
              } else if (!$('#back').is(':visible')) {
                $timeout(function() {
                  var id = $('.inbox-items li').first().attr('data-record-id');
                  $state.go('reports.detail', { id: id });
                });
              }
            }
          }
          _initScroll();
        });
      };

      $scope.$on('query', function() {
        $scope.query();
      });

      var _initScroll = function() {
        scrollLoader.init(function() {
          if (!$scope.loading && $scope.totalItems > $scope.items.length) {
            $timeout(function() {
              $scope.query({ skip: true });
            });
          }
        });
      };

      Changes({ key: 'reports-list' }, function(data) {
        if ($scope.filterModel.type === 'reports') {
          $scope.query({ silent: true, changes: data });
        }
      });

      if (!$stateParams.id) {
        $scope.selectMessage();
      }

      $scope.setFilterQuery($stateParams.query);

      if ($stateParams.tour) {
        $rootScope.$broadcast('TourStart', $stateParams.tour);
      }

      var getNextHalfHour = function() {
        var time = moment().second(0).millisecond(0);
        if (time.minute() < 30) {
          time.minute(30);
        } else {
          time.minute(0);
          time.add(1, 'hours');
        }
        return time;
      };

      var initEditMessageModal = function() {
        $timeout(function() {
          Settings(function(err, res) {
            if (!err) {
              $('#edit-message-group .datepicker').daterangepicker({
                singleDatePicker: true,
                timePicker: true,
                applyClass: 'btn-primary',
                cancelClass: 'btn-link',
                parentEl: '#edit-message-group .modal-dialog .modal-content',
                format: res.reported_date_format,
                minDate: getNextHalfHour()
              },
              function(date) {
                var i = this.element.closest('fieldset').attr('data-index');
                $scope.selectedGroup.rows[i].due = date.toISOString();
              });
            }
          });
        });
      };

      $scope.edit = function(group) {
        $scope.setSelectedGroup(group);
        $('#edit-message-group').modal('show');
        initEditMessageModal();
      };

      $scope.addTask = function(group) {
        group.rows.push({
          due: moment(),
          added: true,
          group: group.number,
          state: 'scheduled',
          messages: [ { message: '' } ]
        });
        initEditMessageModal();
      };
    }
  ]);

}());