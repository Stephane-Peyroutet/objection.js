'use strict';

var _ = require('lodash');
var utils = require('../../lib/utils');
var expect = require('expect.js');
var Promise = require('bluebird');
var transaction = require('../../').transaction;
var ValidationError = require('../../').ValidationError;

module.exports = function (session) {
  var Model1 = session.models.Model1;
  var Model2 = session.models.Model2;

  describe('Model insertWithRelated queries', function () {
    var insertion;
    var eagerExpr = '[model1Relation1.model1Relation3, model1Relation2]';

    beforeEach(function () {
      insertion = {
        model1Prop1: 'root',

        model1Relation1: {
          model1Prop1: 'parent',
          model1Prop2: '#ref{grandChild.idCol}',

          model1Relation3: [{
            "#ref": 'child1'
          }, {
            "#id": 'grandChild',
            model2Prop1: 'cibling2'
          }]
        },

        model1Relation2: [{
          "#id": 'child1',
          model2Prop1: 'child1'
        }, {
          model2Prop1: 'child2'
        }]
      };
    });

    describe('.query().insertWithRelated()', function () {

      beforeEach(function () {
        return session.populate([]);
      });

      it('should insert a model with relations', function () {
        return Model1
          .query()
          .insertWithRelated(insertion)
          .then(function (inserted) {
            return check(inserted, true).return(inserted);
          })
          .then(function (inserted) {
            expect(inserted).to.not.have.property('model1Prop2');
            return Model1.query().eager(eagerExpr).where('id', inserted.id).first();
          })
          .then(function (model) {
            return check(model);
          });
      });

      it('should validate models upon insertion', function (done) {
        insertion.model1Relation1.model1Prop1 = 666;

        return transaction(Model1, Model2, function (Model1, Model2) {
          // We can modify Model1 and Model2 here since it is a subclass of the actual
          // models shared between tests.
          Model1.jsonSchema = {
            type: 'object',
            properties: {
              id: {type: 'integer'},
              model1Id: {type: 'integer'},
              model1Prop1: {type: 'string'},
              model1Prop2: {type: 'integer'}
            }
          };

          Model2.jsonSchema = {
            type: 'object',
            properties: {
              idCol: {type: 'integer'},
              model1Id: {type: 'integer'},
              model2Prop1: {type: 'string'},
              model2Prop2: {type: 'integer'}
            }
          };

          return Model1.query().insertWithRelated(insertion);
        }).then(function () {
          done(new Error('should not get here'));
        }).catch(function (err) {
          expect(err).to.be.a(ValidationError);
          expect(err.data).to.have.property('model1Prop1');

          return Promise.all([
            session.knex('Model1'),
            session.knex('model_2')
          ]);
        }).spread(function (rows1, rows2) {
          expect(rows1).to.have.length(0);
          expect(rows2).to.have.length(0);
          done();
        })
      });

      it('should validate models upon insertion: references in integer columns should be accepted', function () {
        return transaction(Model1, Model2, function (Model1, Model2) {
          // We can modify Model1 and Model2 here since it is a subclass of the actual
          // models shared between tests.
          Model1.jsonSchema = {
            type: 'object',
            properties: {
              id: {type: 'integer'},
              model1Id: {type: 'integer'},
              model1Prop1: {type: 'string'},
              model1Prop2: {type: 'integer'}
            }
          };

          Model2.jsonSchema = {
            type: 'object',
            properties: {
              idCol: {type: 'integer'},
              model1Id: {type: 'integer'},
              model2Prop1: {type: 'string'},
              model2Prop2: {type: 'integer'}
            }
          };

          return Model1
            .query()
            .insertWithRelated(insertion)
            .then(function (inserted) {
              return check(inserted, true).return(inserted);
            })
            .then(function (inserted) {
              expect(inserted).to.not.have.property('model1Prop2');
              return Model1.query().eager(eagerExpr).where('id', inserted.id).first();
            })
            .then(function (model) {
              return check(model);
            });
        });
      });

      if (utils.isPostgres(session.knex)) {
        it('query building methods should be applied to the root models', function () {
          return Model1
            .query()
            .insertWithRelated(insertion)
            .returning('*')
            .then(function (inserted) {
              return check(inserted, true).return(inserted);
            })
            .then(function (inserted) {
              expect(inserted).to.have.property('model1Prop2');
              return Model1.query().eager(eagerExpr).where('id', inserted.id).first();
            })
            .then(function (model) {
              return check(model);
            });
        });
      }

    });

    describe('.query().insertWithRelated().allowRelated()', function () {

      beforeEach(function () {
        return session.populate([]);
      });

      it('should allow insert when the allowed relation expression is a superset', function () {
        return Model1
          .query()
          .insertWithRelated(insertion)
          .allowInsert('[model1Relation1.model1Relation3, model1Relation2]')
          .then(function (inserted) {
            return check(inserted, true).return(inserted);
          });
      });

      it('should not allow insert when the allowed relation expression is not a superset', function (done) {
        return Model1
          .query()
          .insertWithRelated(insertion)
          .allowInsert('[model1Relation1, model1Relation2]')
          .then(function () {
            done(new Error('should not get here'));
          })
          .catch(function (err) {
            expect(err instanceof ValidationError).to.equal(true);
            done();
          });
      });

    });

    describe('.$query().insertWithRelated()', function () {

      beforeEach(function () {
        return session.populate([]);
      });

      it('should insert a model with relations', function () {
        return Model1
          .fromJson(insertion)
          .$query()
          .insertWithRelated()
          .then(function (inserted) {
            return check(inserted, true).return(inserted);
          })
          .then(function (inserted) {
            return Model1.query().eager(eagerExpr).where('id', inserted.id).first();
          })
          .then(function (model) {
            return check(model);
          });
      });

    });

    describe('.$relatedQuery().insertWithRelated()', function () {

      describe('one to one relation', function () {
        var parent;

        beforeEach(function () {
          return session.populate([{
            id: 1,
            model1Prop1: 'hello 1'
          }]);
        });

        beforeEach(function () {
          return Model1
            .query()
            .where('id', 1)
            .first()
            .then(function (par) {
              parent = par;
            });
        });

        it('should insert a model with relations', function () {
          return parent
            .$relatedQuery('model1Relation1')
            .insertWithRelated(insertion)
            .then(function (inserted) {
              return check(inserted, true).return(inserted);
            })
            .then(function (inserted) {
              return parent
                .$relatedQuery('model1Relation1')
                .eager(eagerExpr)
                .first();
            })
            .then(function (model) {
              return check(model);
            });
        });

      });

      describe('one to many relation', function () {
        var parent;

        beforeEach(function () {
          return session.populate([{
            id: 1,
            model1Prop1: 'hello 1'
          }]);
        });

        beforeEach(function () {
          return Model1
            .query()
            .where('id', 1)
            .first()
            .then(function (par) {
              parent = par;
            });
        });

        beforeEach(function () {
          insertion = {
            model2Prop1: 'howdy',
            model2Relation1: [insertion]
          };
        });

        it('should insert a model with relations', function () {
          return parent
            .$relatedQuery('model1Relation2')
            .insertWithRelated(insertion)
            .then(function (inserted) {
              return check(inserted.model2Relation1[0], true);
            })
            .then(function () {
              return parent
                .$relatedQuery('model1Relation2')
                .first();
            })
            .then(function (insertion) {
              expect(insertion.model2Prop1).to.equal('howdy');
              return insertion
                .$relatedQuery('model2Relation1')
                .eager(eagerExpr)
                .first();
            })
            .then(function (model) {
              return check(model);
            });
        });

      });

      describe('many to many relation', function () {
        var parent;

        beforeEach(function () {
          return session.populate([{
            id: 1,
            model1Prop1: 'hello 1'
          }]);
        });

        beforeEach(function () {
          return Model1
            .query()
            .where('id', 1)
            .first()
            .then(function (par) {
              parent = par;
            });
        });

        beforeEach(function () {
          insertion = {
            model2Prop1: 'howdy',
            model2Relation1: [insertion]
          };
        });

        it('should insert a model with relations', function () {
          return parent
            .$relatedQuery('model1Relation3')
            .insertWithRelated(insertion)
            .then(function (inserted) {
              return check(inserted.model2Relation1[0], true);
            })
            .then(function () {
              return parent.$relatedQuery('model1Relation3');
            })
            .then(function (models) {
              var insertion = _.find(models, {model2Prop1: 'howdy'});
              return insertion
                .$relatedQuery('model2Relation1')
                .eager(eagerExpr);
            })
            .then(function (models) {
              var model = _.find(models, {model1Prop1: 'root'});
              return check(model);
            });
        });
      });

    });

    function check(model, shouldCheckHooks) {
      var knex = model.constructor.knex();

      expect(model).to.have.property('model1Relation1');
      expect(model.model1Relation1).to.have.property('model1Relation3');
      expect(model).to.have.property('model1Relation2');

      model.model1Relation1.model1Relation3 = _.sortBy(model.model1Relation1.model1Relation3, 'model2Prop1');
      model.model1Relation2 = _.sortBy(model.model1Relation2, 'model2Prop1');

      expect(model.model1Prop1).to.equal('root');
      shouldCheckHooks && checkHooks(model);

      expect(model.model1Relation1.model1Prop1).to.equal('parent');
      shouldCheckHooks && checkHooks(model.model1Relation1);

      expect(model.model1Relation1.model1Relation3[0].model2Prop1).to.equal('child1');
      shouldCheckHooks && checkHooks(model.model1Relation1.model1Relation3[0]);

      expect(model.model1Relation1.model1Relation3[1].model2Prop1).to.equal('cibling2');
      shouldCheckHooks && checkHooks(model.model1Relation1.model1Relation3[1]);

      expect(model.model1Relation2[0].model2Prop1).to.equal('child1');
      shouldCheckHooks && checkHooks(model.model1Relation2[0]);

      expect(model.model1Relation2[1].model2Prop1).to.equal('child2');
      shouldCheckHooks && checkHooks(model.model1Relation2[1]);

      return knex(Model2.tableName).then(function (rows) {
        // Check that the reference model was only inserted once.
        expect(_.where(rows, {model_2_prop_1: 'child1'})).to.have.length(1);
      });
    }

    function checkHooks(model) {
      expect(model.$beforeInsertCalled).to.equal(true);
      expect(model.$afterInsertCalled).to.equal(true);
    }

  });
};
