(function (window) {
    window.extractData = function () {
        var ret = $.Deferred();

        function onError() {
            console.log('Loading error', arguments);
            ret.reject();
        }

        function onReady(smart) {
            if (smart.hasOwnProperty('patient')) {
                var patient = smart.patient;
                var pt = patient.read();
                // https://loinc.org/
                // 8302-2 = Body height
                // 8462-4 = Diastolic blood pressure
                // 8480-6 = Systolic blood pressure
                // 2085-9 = Cholesterol in HDL [Mass/volume] in Serum or Plasma
                // 2089-1 = Cholesterol in LDL [Mass/volume] in Serum or Plasma
                // 55284-4 = Blood pressure systolic and diastolic
                // 40443-4 = Heart rate --resting
                var obv = smart.patient.api.fetchAll({
                    type: 'Observation',
                    query: {
                        code: {
                            $or: ['http://loinc.org|8302-2', 'http://loinc.org|8462-4',
                                'http://loinc.org|8480-6', 'http://loinc.org|2085-9',
                                'http://loinc.org|40443-4',
                                'http://loinc.org|2089-1', 'http://loinc.org|55284-4']
                        }
                    }
                });

                $.when(pt, obv).fail(onError);

                $.when(pt, obv).done(function (patient, obv) {
                    var byCodes = smart.byCodes(obv, 'code');
                    var gender = patient.gender;
                    var dob = new Date(patient.birthDate);
                    var day = dob.getDate();
                    var monthIndex = dob.getMonth() + 1;
                    var year = dob.getFullYear();

                    var dobStr = monthIndex + '/' + day + '/' + year;
                    var fname = '';
                    var lname = '';

                    if (typeof patient.name[0] !== 'undefined') {
                        fname = patient.name[0].given.join(' ');
                        lname = patient.name[0].family.join(' ');
                    }

                    var height = byCodes('8302-2');
                    var systolicbp = getBloodPressureValue(byCodes('55284-4'), '8480-6');
                    var diastolicbp = getBloodPressureValue(byCodes('55284-4'), '8462-4');
                    var hdl = byCodes('2085-9');
                    var ldl = byCodes('2089-1');
                    var hr = byCodes('40443-4');

                    var mtpinputs = {heartrate: {value: 0, units: ''},
                                    systolicbp: {value: 0, units: ''},
                                    basedeficit: {value: 0, units: ''},
                                    'moi':''
                    };

                    if (typeof systolicbp == 'string') {
                    		//TODO: Use observation.component.valueQuanatity
                    		s = systolicbp.split(" ");
                    		if (s.length==2) {
                    			mtpinputs.systolicbp.value = parseInt(s[0]);
                    			mtpinputs.systolicbp.units = s[1];
                    		}
                    	}
                    console.log(mtpinputs);

                    var p = defaultPatient();
                    p.mtpinputs = mtpinputs;
                    p.birthdate = dobStr;
                    p.gender = gender;
                    p.fname = fname;
                    p.lname = lname;
                    p.age = parseInt(calculateAge(dob));
                    p.height = getQuantityValueAndUnit(height[0]);
                    p.heartrate = hr;

                    if (typeof systolicbp != 'undefined') {
                        p.systolicbp = systolicbp;
                    }

                    if (typeof diastolicbp != 'undefined') {
                        p.diastolicbp = diastolicbp;
                    }

                    p.hdl = getQuantityValueAndUnit(hdl[0]);
                    p.ldl = getQuantityValueAndUnit(ldl[0]);

                    ret.resolve(p);
                });
            } else {
                onError();
            }
        }

        FHIR.oauth2.ready(onReady, onError);
        return ret.promise();

    };

    function defaultPatient() {
        return {
            fname: {value: ''},
            lname: {value: ''},
            gender: {value: ''},
            birthdate: {value: ''},
            age: {value: ''},
            height: {value: ''},
            systolicbp: {value: ''},
            diastolicbp: {value: ''},
            ldl: {value: ''},
            hdl: {value: ''},
            heartrate: {value: ''},
            mtpinputs: {
                heartrate: {value: 0, units: ''},
                systolicbp: {value: 0, units: ''},
                basedeficit: {value: 0, units: ''},
                moi: '',

            }
        };
    }

    function getBloodPressureValues(BPObservations, typeOfPressure) {
        var formattedBPObservations = [];
        BPObservations.forEach(function (observation) {
            var BP = observation.component.find(function (component) {
                return component.code.coding.find(function (coding) {
                    return coding.code == typeOfPressure;
                });
            });
            if (BP) {
                observation.valueQuantity = BP.valueQuantity;
                formattedBPObservations.push(observation);
            }
        });

        return getQuantityValueAndUnitFromObservation(formattedBPObservations[0]);
    }

    function getBloodPressureValue(BPObservations, typeOfPressure) {
        var formattedBPObservations = [];
        BPObservations.forEach(function (observation) {
            var BP = observation.component.find(function (component) {
                return component.code.coding.find(function (coding) {
                    return coding.code == typeOfPressure;
                });
            });
            if (BP) {
                observation.valueQuantity = BP.valueQuantity;
                formattedBPObservations.push(observation);
            }
        });

        return getQuantityValueAndUnit(formattedBPObservations[0]);
    }

    function isLeapYear(year) {
        return new Date(year, 1, 29).getMonth() === 1;
    }

    function calculateAge(date) {
        if (Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime())) {
            var d = new Date(date), now = new Date();
            var years = now.getFullYear() - d.getFullYear();
            d.setFullYear(d.getFullYear() + years);
            if (d > now) {
                years--;
                d.setFullYear(d.getFullYear() - 1);
            }
            var days = (now.getTime() - d.getTime()) / (3600 * 24 * 1000);
            return years + days / (isLeapYear(now.getFullYear()) ? 366 : 365);
        } else {
            return undefined;
        }
    }

    function getQuantityValueAndUnitFromObservation(ob) {
        if (typeof ob != 'undefined' &&
                typeof ob.valueQuantity != 'undefined' &&
                typeof ob.valueQuantity.value != 'undefined' &&
                typeof ob.valueQuantity.unit != 'undefined') {
            return {value: ob.valueQuantity.value, units: ob.valueQuantity.unit};
        } else {
            return undefined;
        }
    }

    function getQuantityValueAndUnit(ob) {
        if (typeof ob != 'undefined' &&
                typeof ob.valueQuantity != 'undefined' &&
                typeof ob.valueQuantity.value != 'undefined' &&
                typeof ob.valueQuantity.unit != 'undefined') {
            return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
        } else {
            return undefined;
        }
    }

    window.drawVisualization = function (p) {
        $('#holder').show();
        $('#loading').hide();
        systolicbp = 0;
        basedeficit = 0;
        heartrate = 0;
        if (p) {
            $('#fname').html(p.fname);
            $('#lname').html(p.lname);
            $('#gender').html(p.gender);
            $('#birthdate').html(p.birthdate);
            $('#age').html(p.age);
            $('#height').html(p.height);
            $('#systolicbp').html(p.systolicbp);
            $('#diastolicbp').html(p.diastolicbp);
            $('#ldl').html(p.ldl);
            $('#hdl').html(p.hdl);
            $('#heartrate').html(p.heartrate);
            if (p.mtpinputs.systolicbp && p.mtpinputs.systolicbp.units && p.mtpinputs.systolicbp.units=='mmHg') systolicbp = p.mtpinputs.systolicbp.value;
            heartrate = p.mtpinputs.heartrate.value;
        }
        $('#mtp_systolicbp').spinner("value", systolicbp);
        $('#mtp_heartrate').spinner("value", heartrate);
        $('#mtp_basedeficit').spinner("value", basedeficit);
    };


})(window);
