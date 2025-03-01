/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017, 2018, 2019 New Vector Ltd

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
import { _t } from '../../../languageHandler';
import sdk from '../../../index';
import Modal from "../../../Modal";
import Tchap from '../../../Tchap';

import PasswordReset from "../../../PasswordReset";
import TchapStrongPassword from "../../../TchapStrongPassword";

// Phases
// Show the forgot password inputs
const PHASE_FORGOT = 1;
// Email is in the process of being sent
const PHASE_SENDING_EMAIL = 2;
// Email has been sent
const PHASE_EMAIL_SENT = 3;
// User has clicked the link in email and completed reset
const PHASE_DONE = 4;

module.exports = React.createClass({
    displayName: 'ForgotPassword',

    propTypes: {
        // The default server name to use when the user hasn't specified
        // one. If set, `defaultHsUrl` and `defaultHsUrl` were derived for this
        // via `.well-known` discovery. The server name is used instead of the
        // HS URL when talking about "your account".
        defaultServerName: PropTypes.string,
        // An error passed along from higher up explaining that something
        // went wrong when finding the defaultHsUrl.
        defaultServerDiscoveryError: PropTypes.string,

        defaultHsUrl: PropTypes.string,
        defaultIsUrl: PropTypes.string,
        customHsUrl: PropTypes.string,
        customIsUrl: PropTypes.string,

        onLoginClick: PropTypes.func,
        onComplete: PropTypes.func.isRequired,
    },

    getInitialState: function() {
        return {
            enteredHsUrl: this.props.customHsUrl || this.props.defaultHsUrl,
            enteredIsUrl: this.props.customIsUrl || this.props.defaultIsUrl,
            phase: PHASE_FORGOT,
            email: "",
            password: "",
            password2: "",
            errorText: null,
        };
    },

    submitPasswordReset: function(hsUrl, identityUrl, email, password) {
        this.setState({
            phase: PHASE_SENDING_EMAIL,
        });
        this.reset = new PasswordReset(hsUrl, identityUrl);
        let lowercaseEmail = email.toLowerCase();
        this.reset.resetPassword(lowercaseEmail, password).done(() => {
            this.setState({
                phase: PHASE_EMAIL_SENT,
            });
        }, (err) => {
            this.showErrorDialog(_t('Failed to send email') + ": " + err.message);
            this.setState({
                phase: PHASE_FORGOT,
            });
        });
    },

    onVerify: function(ev) {
        ev.preventDefault();
        if (!this.reset) {
            console.error("onVerify called before submitPasswordReset!");
            return;
        }
        this.reset.checkEmailLinkClicked().done((res) => {
            this.setState({ phase: PHASE_DONE });
        }, (err) => {
            this.showErrorDialog(err.message);
        });
    },

    onSubmitForm: function(ev) {
        ev.preventDefault();

        // Don't allow the user to register if there's a discovery error
        // Without this, the user could end up registering on the wrong homeserver.
        if (this.props.defaultServerDiscoveryError) {
            this.setState({errorText: this.props.defaultServerDiscoveryError});
            return;
        }

        if (!this.state.email) {
            this.showErrorDialog(_t('The email address linked to your account must be entered.'));
        } else if (!this.state.password || !this.state.password2) {
            this.showErrorDialog(_t('A new password must be entered.'));
        } else if (this.state.password !== this.state.password2) {
            this.showErrorDialog(_t('New passwords must match each other.'));
        } else {

            Tchap.discoverPlatform(this.state.email).then(hs => {
                TchapStrongPassword.validatePassword(hs, this.state.password).then(isValidPassword => {
                    if (!isValidPassword) {
                        this.showErrorDialog(_t('This password is too weak. It must include a lower-case letter, an upper-case letter, a number and a symbol and be at a minimum 8 characters in length.'));
                    } else {
                        const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
                        Modal.createTrackedDialog('Forgot Password Warning', '', QuestionDialog, {
                            title: _t('Warning!'),
                            description:
                                <div>
                                    { _t(
                                        "Changing your password will reset any end-to-end encryption keys " +
                                        "on all of your devices, making encrypted chat history unreadable. Set up " +
                                        "Key Backup or export your room keys from another device before resetting your " +
                                        "password.",
                                    ) }
                                </div>,
                            button: _t('Continue'),
                            onFinished: (confirmed) => {
                                if (confirmed) {
                                    this.submitPasswordReset(
                                        hs, hs,
                                        this.state.email, this.state.password,
                                    );
                                }
                            },
                        });
                    }
                });
            });
        }
    },

    onInputChanged: function(stateKey, ev) {
        this.setState({
            [stateKey]: ev.target.value,
        });
    },

    onLoginClick: function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.props.onLoginClick();
    },

    showErrorDialog: function(body, title) {
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog('Forgot Password Error', '', ErrorDialog, {
            title: title,
            description: body,
        });
    },

    renderForgot() {
        const Field = sdk.getComponent('elements.Field');

        let errorText = null;
        const err = this.state.errorText || this.props.defaultServerDiscoveryError;
        if (err) {
            errorText = <div className="mx_Login_error">{ err }</div>;
        }

        return <div>
            {errorText}
            <form onSubmit={this.onSubmitForm}>
                <div className="mx_AuthBody_fieldRow">
                    <Field
                        id="mx_ForgotPassword_email"
                        name="reset_email" // define a name so browser's password autofill gets less confused
                        type="text"
                        label={_t('Email')}
                        value={this.state.email}
                        onChange={this.onInputChanged.bind(this, "email")}
                        autoFocus
                    />
                </div>
                <div className="mx_AuthBody_fieldRow">
                    <Field
                        id="mx_ForgotPassword_password"
                        name="reset_password"
                        type="password"
                        label={_t('Password')}
                        value={this.state.password}
                        onChange={this.onInputChanged.bind(this, "password")}
                    />
                    <Field
                        id="mx_ForgotPassword_passwordConfirm"
                        name="reset_password_confirm"
                        type="password"
                        label={_t('Confirm')}
                        value={this.state.password2}
                        onChange={this.onInputChanged.bind(this, "password2")}
                    />
                    <img className="tc_PasswordHelper" src={require('../../../../res/img/question_mark.svg')}
                         width={25} height={25}
                         title={ _t('This password is too weak. It must include a lower-case letter, an upper-case letter, a number and a symbol and be at a minimum 8 characters in length.') } alt={""} />
                </div>
                <span>{_t(
                    'A verification email will be sent to your inbox to confirm ' +
                    'setting your new password.',
                )}</span>
                <input className="mx_Login_submit" type="submit" value={_t('Send Reset Email')} />
            </form>
            <a className="mx_AuthBody_changeFlow" onClick={this.onLoginClick} href="#">
                {_t('Sign in instead')}
            </a>
        </div>;
    },

    renderSendingEmail() {
        const Spinner = sdk.getComponent("elements.Spinner");
        return <Spinner />;
    },

    renderEmailSent() {
        return <div>
            {_t("An email has been sent to %(emailAddress)s. Once you've followed the " +
                "link it contains, click below.", { emailAddress: this.state.email })}
            <br />
            <input className="mx_Login_submit" type="button" onClick={this.onVerify}
                value={_t('I have verified my email address')} />
        </div>;
    },

    renderDone() {
        return <div>
            <p>{_t("Your password has been reset.")}</p>
            <p>{_t(
                "You have been logged out of all devices and will no longer receive " +
                "push notifications. To re-enable notifications, sign in again on each " +
                "device.",
            )}</p>
            <input className="mx_Login_submit" type="button" onClick={this.props.onComplete}
                value={_t('Return to login screen')} />
        </div>;
    },

    render: function() {
        const AuthPage = sdk.getComponent("auth.AuthPage");
        const AuthHeader = sdk.getComponent("auth.AuthHeader");
        const AuthBody = sdk.getComponent("auth.AuthBody");

        let resetPasswordJsx;
        switch (this.state.phase) {
            case PHASE_FORGOT:
                resetPasswordJsx = this.renderForgot();
                break;
            case PHASE_SENDING_EMAIL:
                resetPasswordJsx = this.renderSendingEmail();
                break;
            case PHASE_EMAIL_SENT:
                resetPasswordJsx = this.renderEmailSent();
                break;
            case PHASE_DONE:
                resetPasswordJsx = this.renderDone();
                break;
        }

        return (
            <AuthPage>
                <AuthHeader />
                <AuthBody>
                    <h2> { _t('Set a new password') } </h2>
                    {resetPasswordJsx}
                </AuthBody>
            </AuthPage>
        );
    },
});
