/*
Copyright 2016 OpenMarket Ltd
Copyright 2017 Vector Creations Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react';
import PropTypes from 'prop-types';
import url from 'url';
import classnames from 'classnames';

import sdk from '../../../index';
import { _t } from '../../../languageHandler';
import SettingsStore from "../../../settings/SettingsStore";

/* This file contains a collection of components which are used by the
 * InteractiveAuth to prompt the user to enter the information needed
 * for an auth stage. (The intention is that they could also be used for other
 * components, such as the registration flow).
 *
 * Call getEntryComponentForLoginType() to get a component suitable for a
 * particular login type. Each component requires the same properties:
 *
 * matrixClient:           A matrix client. May be a different one to the one
 *                         currently being used generally (eg. to register with
 *                         one HS whilst beign a guest on another).
 * loginType:              the login type of the auth stage being attempted
 * authSessionId:          session id from the server
 * clientSecret:           The client secret in use for ID server auth sessions
 * stageParams:            params from the server for the stage being attempted
 * errorText:              error message from a previous attempt to authenticate
 * submitAuthDict:         a function which will be called with the new auth dict
 * busy:                   a boolean indicating whether the auth logic is doing something
 *                         the user needs to wait for.
 * inputs:                 Object of inputs provided by the user, as in js-sdk
 *                         interactive-auth
 * stageState:             Stage-specific object used for communicating state information
 *                         to the UI from the state-specific auth logic.
 *                         Defined keys for stages are:
 *                             m.login.email.identity:
 *                              * emailSid: string representing the sid of the active
 *                                          verification session from the ID server, or
 *                                          null if no session is active.
 * fail:                   a function which should be called with an error object if an
 *                         error occurred during the auth stage. This will cause the auth
 *                         session to be failed and the process to go back to the start.
 * setEmailSid:            m.login.email.identity only: a function to be called with the
 *                         email sid after a token is requested.
 * makeRegistrationUrl     A function that makes a registration URL
 *
 * Each component may also provide the following functions (beyond the standard React ones):
 *    focus: set the input focus appropriately in the form.
 */

export const PasswordAuthEntry = React.createClass({
    displayName: 'PasswordAuthEntry',

    statics: {
        LOGIN_TYPE: "m.login.password",
    },

    propTypes: {
        matrixClient: PropTypes.object.isRequired,
        submitAuthDict: PropTypes.func.isRequired,
        errorText: PropTypes.string,
        // is the auth logic currently waiting for something to
        // happen?
        busy: PropTypes.bool,
    },

    getInitialState: function() {
        return {
            passwordValid: false,
        };
    },

    focus: function() {
        if (this.refs.passwordField) {
            this.refs.passwordField.focus();
        }
    },

    _onSubmit: function(e) {
        e.preventDefault();
        if (this.props.busy) return;

        this.props.submitAuthDict({
            type: PasswordAuthEntry.LOGIN_TYPE,
            user: this.props.matrixClient.credentials.userId,
            password: this.refs.passwordField.value,
        });
    },

    _onPasswordFieldChange: function(ev) {
        // enable the submit button iff the password is non-empty
        this.setState({
            passwordValid: Boolean(this.refs.passwordField.value),
        });
    },

    render: function() {
        let passwordBoxClass = null;

        if (this.props.errorText) {
            passwordBoxClass = 'error';
        }

        let submitButtonOrSpinner;
        if (this.props.busy) {
            const Loader = sdk.getComponent("elements.Spinner");
            submitButtonOrSpinner = <Loader />;
        } else {
            submitButtonOrSpinner = (
                <input type="submit"
                    className="mx_Dialog_primary"
                    disabled={!this.state.passwordValid}
                />
            );
        }

        let errorSection;
        if (this.props.errorText) {
            errorSection = (
                <div className="error" role="alert">
                    { this.props.errorText }
                </div>
            );
        }

        return (
            <div>
                <p>{ _t("To continue, please enter your password.") }</p>
                <form onSubmit={this._onSubmit}>
                    <label htmlFor="passwordField">{ _t("Password:") }</label>
                    <input
                        name="passwordField"
                        ref="passwordField"
                        className={passwordBoxClass}
                        onChange={this._onPasswordFieldChange}
                        type="password"
                    />
                    <div className="mx_button_row">
                        { submitButtonOrSpinner }
                    </div>
                </form>
            { errorSection }
            </div>
        );
    },
});

export const RecaptchaAuthEntry = React.createClass({
    displayName: 'RecaptchaAuthEntry',

    statics: {
        LOGIN_TYPE: "m.login.recaptcha",
    },

    propTypes: {
        submitAuthDict: PropTypes.func.isRequired,
        stageParams: PropTypes.object.isRequired,
        errorText: PropTypes.string,
        busy: PropTypes.bool,
    },

    _onCaptchaResponse: function(response) {
        this.props.submitAuthDict({
            type: RecaptchaAuthEntry.LOGIN_TYPE,
            response: response,
        });
    },

    render: function() {
        if (this.props.busy) {
            const Loader = sdk.getComponent("elements.Spinner");
            return <Loader />;
        }

        const CaptchaForm = sdk.getComponent("views.auth.CaptchaForm");
        const sitePublicKey = this.props.stageParams.public_key;

        let errorSection;
        if (this.props.errorText) {
            errorSection = (
                <div className="error" role="alert">
                    { this.props.errorText }
                </div>
            );
        }

        return (
            <div>
                <CaptchaForm sitePublicKey={sitePublicKey}
                    onCaptchaResponse={this._onCaptchaResponse}
                />
                { errorSection }
            </div>
        );
    },
});

export const TermsAuthEntry = React.createClass({
    displayName: 'TermsAuthEntry',

    statics: {
        LOGIN_TYPE: "m.login.terms",
    },

    propTypes: {
        submitAuthDict: PropTypes.func.isRequired,
        stageParams: PropTypes.object.isRequired,
        errorText: PropTypes.string,
        busy: PropTypes.bool,
        showContinue: PropTypes.bool,
    },

    componentWillMount: function() {
        // example stageParams:
        //
        // {
        //     "policies": {
        //         "privacy_policy": {
        //             "version": "1.0",
        //             "en": {
        //                 "name": "Privacy Policy",
        //                 "url": "https://example.org/privacy-1.0-en.html",
        //             },
        //             "fr": {
        //                 "name": "Politique de confidentialité",
        //                 "url": "https://example.org/privacy-1.0-fr.html",
        //             },
        //         },
        //         "other_policy": { ... },
        //     }
        // }

        const allPolicies = this.props.stageParams.policies || {};
        const prefLang = SettingsStore.getValue("language");
        const initToggles = {};
        const pickedPolicies = [];
        for (const policyId of Object.keys(allPolicies)) {
            const policy = allPolicies[policyId];

            // Pick a language based on the user's language, falling back to english,
            // and finally to the first language available. If there's still no policy
            // available then the homeserver isn't respecting the spec.
            let langPolicy = policy[prefLang];
            if (!langPolicy) langPolicy = policy["en"];
            if (!langPolicy) {
                // last resort
                const firstLang = Object.keys(policy).find(e => e !== "version");
                langPolicy = policy[firstLang];
            }
            if (!langPolicy) throw new Error("Failed to find a policy to show the user");

            initToggles[policyId] = false;

            langPolicy.id = policyId;
            pickedPolicies.push(langPolicy);
        }

        this.setState({
            "toggledPolicies": initToggles,
            "policies": pickedPolicies,
        });
    },

    tryContinue: function() {
        this._trySubmit();
    },

    _togglePolicy: function(policyId) {
        const newToggles = {};
        for (const policy of this.state.policies) {
            let checked = this.state.toggledPolicies[policy.id];
            if (policy.id === policyId) checked = !checked;

            newToggles[policy.id] = checked;
        }
        this.setState({"toggledPolicies": newToggles});
    },

    _trySubmit: function() {
        let allChecked = true;
        for (const policy of this.state.policies) {
            const checked = this.state.toggledPolicies[policy.id];
            allChecked = allChecked && checked;
        }

        if (allChecked) this.props.submitAuthDict({type: TermsAuthEntry.LOGIN_TYPE});
        else this.setState({errorText: _t("Please review and accept all of the homeserver's policies")});
    },

    render: function() {
        if (this.props.busy) {
            const Loader = sdk.getComponent("elements.Spinner");
            return <Loader />;
        }

        const checkboxes = [];
        let allChecked = true;
        for (const policy of this.state.policies) {
            const checked = this.state.toggledPolicies[policy.id];
            allChecked = allChecked && checked;

            checkboxes.push(
                <label key={"policy_checkbox_" + policy.id} className="mx_InteractiveAuthEntryComponents_termsPolicy">
                    <input type="checkbox" onClick={() => this._togglePolicy(policy.id)} checked={checked} />
                    <a href={policy.url} target="_blank" rel="noopener">{ policy.name }</a>
                </label>,
            );
        }

        let errorSection;
        if (this.props.errorText || this.state.errorText) {
            errorSection = (
                <div className="error" role="alert">
                    { this.props.errorText || this.state.errorText }
                </div>
            );
        }

        let submitButton;
        if (this.props.showContinue !== false) {
            // XXX: button classes
            submitButton = <button className="mx_InteractiveAuthEntryComponents_termsSubmit mx_GeneralButton"
                                   onClick={this._trySubmit} disabled={!allChecked}>{_t("Accept")}</button>;
        }

        return (
            <div>
                <p>{_t("Please review and accept the policies of this homeserver:")}</p>
                { checkboxes }
                { errorSection }
                { submitButton }
            </div>
        );
    },
});

export const EmailIdentityAuthEntry = React.createClass({
    displayName: 'EmailIdentityAuthEntry',

    statics: {
        LOGIN_TYPE: "m.login.email.identity",
    },

    propTypes: {
        matrixClient: PropTypes.object.isRequired,
        submitAuthDict: PropTypes.func.isRequired,
        authSessionId: PropTypes.string.isRequired,
        clientSecret: PropTypes.string.isRequired,
        inputs: PropTypes.object.isRequired,
        stageState: PropTypes.object.isRequired,
        fail: PropTypes.func.isRequired,
        setEmailSid: PropTypes.func.isRequired,
        makeRegistrationUrl: PropTypes.func.isRequired,
    },

    getInitialState: function() {
        return {
            requestingToken: false,
        };
    },

    componentWillMount: function() {
        if (this.props.stageState.emailSid === null) {
            this.setState({requestingToken: true});
            this._requestEmailToken().catch((e) => {
                this.props.fail(e);
            }).finally(() => {
                this.setState({requestingToken: false});
            }).done();
        }
    },

    /*
     * Requests a verification token by email.
     */
    _requestEmailToken: function() {
        const nextLink = this.props.makeRegistrationUrl({
            client_secret: this.props.clientSecret,
            hs_url: this.props.matrixClient.getHomeserverUrl(),
            is_url: this.props.matrixClient.getIdentityServerUrl(),
            session_id: this.props.authSessionId,
        });

        return this.props.matrixClient.requestRegisterEmailToken(
            this.props.inputs.emailAddress,
            this.props.clientSecret,
            1, // TODO: Multiple send attempts?
            nextLink,
        ).then((result) => {
            this.props.setEmailSid(result.sid);
        });
    },

    render: function() {
        if (this.state.requestingToken) {
            const Loader = sdk.getComponent("elements.Spinner");
            return <Loader />;
        } else {
            return (
                <div>
                    <p>{ _t("An email has been sent to %(emailAddress)s",
                        { emailAddress: (sub) => <i>{ this.props.inputs.emailAddress }</i> },
                    ) }
                    </p>
                    <p>{ _t("Please check your email to continue registration.") }</p>
                </div>
            );
        }
    },
});

export const FallbackAuthEntry = React.createClass({
    displayName: 'FallbackAuthEntry',

    propTypes: {
        matrixClient: PropTypes.object.isRequired,
        authSessionId: PropTypes.string.isRequired,
        loginType: PropTypes.string.isRequired,
        submitAuthDict: PropTypes.func.isRequired,
        errorText: PropTypes.string,
    },

    componentWillMount: function() {
        // we have to make the user click a button, as browsers will block
        // the popup if we open it immediately.
        this._popupWindow = null;
        window.addEventListener("message", this._onReceiveMessage);
    },

    componentWillUnmount: function() {
        window.removeEventListener("message", this._onReceiveMessage);
        if (this._popupWindow) {
            this._popupWindow.close();
        }
    },

    focus: function() {
        if (this.refs.fallbackButton) {
            this.refs.fallbackButton.focus();
        }
    },

    _onShowFallbackClick: function() {
        const url = this.props.matrixClient.getFallbackAuthUrl(
            this.props.loginType,
            this.props.authSessionId,
        );
        this._popupWindow = window.open(url);
    },

    _onReceiveMessage: function(event) {
        if (
            event.data === "authDone" &&
            event.origin === this.props.matrixClient.getHomeserverUrl()
        ) {
            this.props.submitAuthDict({});
        }
    },

    render: function() {
        let errorSection;
        if (this.props.errorText) {
            errorSection = (
                <div className="error" role="alert">
                    { this.props.errorText }
                </div>
            );
        }
        return (
            <div>
                <a ref="fallbackButton" onClick={this._onShowFallbackClick}>{ _t("Start authentication") }</a>
                {errorSection}
            </div>
        );
    },
});

const AuthEntryComponents = [
    PasswordAuthEntry,
    RecaptchaAuthEntry,
    EmailIdentityAuthEntry,
    TermsAuthEntry,
];

export function getEntryComponentForLoginType(loginType) {
    for (const c of AuthEntryComponents) {
        if (c.LOGIN_TYPE == loginType) {
            return c;
        }
    }
    return FallbackAuthEntry;
}
