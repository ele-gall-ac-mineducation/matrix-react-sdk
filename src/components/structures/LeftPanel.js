/*
Copyright 2015, 2016 OpenMarket Ltd

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

'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { MatrixClient } from 'matrix-js-sdk';
import { KeyCode } from '../../Keyboard';
import sdk from '../../index';
import dis from '../../dispatcher';
import VectorConferenceHandler from '../../VectorConferenceHandler';
import TagPanelButtons from './TagPanelButtons';
import SettingsStore from '../../settings/SettingsStore';
import {_t} from "../../languageHandler";
import Analytics from "../../Analytics";


const LeftPanel = React.createClass({
    displayName: 'LeftPanel',

    // NB. If you add props, don't forget to update
    // shouldComponentUpdate!
    propTypes: {
        collapsed: PropTypes.bool.isRequired,
    },

    contextTypes: {
        matrixClient: PropTypes.instanceOf(MatrixClient),
    },

    getInitialState: function() {
        return {
            searchFilter: '',
            breadcrumbs: false,
        };
    },

    componentWillMount: function() {
        this.focusedElement = null;

        this._settingWatchRef = SettingsStore.watchSetting(
            "feature_room_breadcrumbs", null, this._onBreadcrumbsChanged);

        const useBreadcrumbs = SettingsStore.isFeatureEnabled("feature_room_breadcrumbs");
        Analytics.setBreadcrumbs(useBreadcrumbs);
        this.setState({breadcrumbs: useBreadcrumbs});
    },

    componentWillUnmount: function() {
        SettingsStore.unwatchSetting(this._settingWatchRef);
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        // MatrixChat will update whenever the user switches
        // rooms, but propagating this change all the way down
        // the react tree is quite slow, so we cut this off
        // here. The RoomTiles listen for the room change
        // events themselves to know when to update.
        // We just need to update if any of these things change.
        if (
            this.props.collapsed !== nextProps.collapsed ||
            this.props.disabled !== nextProps.disabled
        ) {
            return true;
        }

        if (this.state.searchFilter !== nextState.searchFilter) {
            return true;
        }

        return false;
    },

    componentDidUpdate(prevProps, prevState) {
        if (prevState.breadcrumbs !== this.state.breadcrumbs) {
            Analytics.setBreadcrumbs(this.state.breadcrumbs);
        }
    },

    _onBreadcrumbsChanged: function(settingName, roomId, level, valueAtLevel, value) {
        // Features are only possible at a single level, so we can get away with using valueAtLevel.
        // The SettingsStore runs on the same tick as the update, so `value` will be wrong.
        this.setState({breadcrumbs: valueAtLevel});

        // For some reason the setState doesn't trigger a render of the component, so force one.
        // Probably has to do with the change happening outside of a change detector cycle.
        this.forceUpdate();
    },

    _onFocus: function(ev) {
        this.focusedElement = ev.target;
    },

    _onBlur: function(ev) {
        this.focusedElement = null;
    },

    _onKeyDown: function(ev) {
        if (!this.focusedElement) return;
        let handled = true;

        switch (ev.keyCode) {
            case KeyCode.TAB:
                this._onMoveFocus(ev.shiftKey);
                break;
            case KeyCode.UP:
                this._onMoveFocus(true);
                break;
            case KeyCode.DOWN:
                this._onMoveFocus(false);
                break;
            case KeyCode.ENTER:
                this._onMoveFocus(false);
                if (this.focusedElement) {
                    this.focusedElement.click();
                }
                break;
            default:
                handled = false;
        }

        if (handled) {
            ev.stopPropagation();
            ev.preventDefault();
        }
    },

    _onMoveFocus: function(up) {
        let element = this.focusedElement;

        // unclear why this isn't needed
        // var descending = (up == this.focusDirection) ? this.focusDescending : !this.focusDescending;
        // this.focusDirection = up;

        let descending = false; // are we currently descending or ascending through the DOM tree?
        let classes;

        do {
            const child = up ? element.lastElementChild : element.firstElementChild;
            const sibling = up ? element.previousElementSibling : element.nextElementSibling;

            if (descending) {
                if (child) {
                    element = child;
                } else if (sibling) {
                    element = sibling;
                } else {
                    descending = false;
                    element = element.parentElement;
                }
            } else {
                if (sibling) {
                    element = sibling;
                    descending = true;
                } else {
                    element = element.parentElement;
                }
            }

            if (element) {
                classes = element.classList;
                if (classes.contains("mx_LeftPanel")) { // we hit the top
                    element = up ? element.lastElementChild : element.firstElementChild;
                    descending = true;
                }
            }
        } while (element && !(
            classes.contains("mx_RoomTile") ||
            classes.contains("mx_textinput_search")));

        if (element) {
            element.focus();
            this.focusedElement = element;
            this.focusedDescending = descending;
        }
    },

    onHideClick: function() {
        dis.dispatch({
            action: 'hide_left_panel',
        });
    },

    onSearch: function(term) {
        this.setState({ searchFilter: term });
    },

    onSearchCleared: function(source) {
        if (source === "keyboard") {
            dis.dispatch({action: 'focus_composer'});
        }
    },

    collectRoomList: function(ref) {
        this._roomList = ref;
    },

    render: function() {
        const RoomList = sdk.getComponent('rooms.RoomList');
        const RoomBreadcrumbs = sdk.getComponent('rooms.RoomBreadcrumbs');
        const TagPanel = sdk.getComponent('structures.TagPanel');
        const CustomRoomTagPanel = sdk.getComponent('structures.CustomRoomTagPanel');
        const TopLeftMenuButton = sdk.getComponent('structures.TopLeftMenuButton');
        const SearchBox = sdk.getComponent('structures.SearchBox');
        const CallPreview = sdk.getComponent('voip.CallPreview');

        const tagPanelEnabled = false;
        let tagPanelContainer;

        const isCustomTagsEnabled = SettingsStore.isFeatureEnabled("feature_custom_tags");

        if (tagPanelEnabled) {
            tagPanelContainer = (<div className="mx_LeftPanel_tagPanelContainer">
                <TagPanel />
                { isCustomTagsEnabled ? <CustomRoomTagPanel /> : undefined }
                <TagPanelButtons />
            </div>);
        }

        const containerClasses = classNames(
            "mx_LeftPanel_container", "mx_fadable",
            {
                "collapsed": this.props.collapsed,
                "mx_LeftPanel_container_hasTagPanel": tagPanelEnabled,
                "mx_fadable_faded": this.props.disabled,
            },
        );

        const searchBox = (<SearchBox
            enableRoomSearchFocus={true}
            placeholder={ _t('Filter room names') }
            onSearch={ this.onSearch }
            onCleared={ this.onSearchCleared }
            collapsed={this.props.collapsed} />);

        let breadcrumbs;
        if (this.state.breadcrumbs) {
            breadcrumbs = (<RoomBreadcrumbs collapsed={this.props.collapsed} />);
        }

        return (
            <div className={containerClasses}>
                { tagPanelContainer }
                <aside className={"mx_LeftPanel dark-panel"} onKeyDown={ this._onKeyDown } onFocus={ this._onFocus } onBlur={ this._onBlur }>
                    <TopLeftMenuButton collapsed={ this.props.collapsed } />
                    { breadcrumbs }
                    { searchBox }
                    <CallPreview ConferenceHandler={VectorConferenceHandler} />
                    <RoomList
                        ref={this.collectRoomList}
                        resizeNotifier={this.props.resizeNotifier}
                        collapsed={this.props.collapsed}
                        searchFilter={this.state.searchFilter}
                        ConferenceHandler={VectorConferenceHandler} />
                    <div className={"tc_RepFr_logo"}>
                        <img src={require('../../../res/img/tchap/logo_rep_fr_black.svg')} alt="logo_rep_fr" />
                    </div>
                    <div className={"tc_Bottom_Links"}>
                        <a href={"https://www.tchap.gouv.fr/faq/"} rel='noreferrer nofollow noopener' target='_blank'>{_t('FAQ')}</a>&nbsp;·&nbsp;
                        <a href={"https://www.tchap.gouv.fr/cgu/"} rel='noreferrer nofollow noopener' target='_blank'>{_t('TAC')}</a>&nbsp;·&nbsp;
                        <a href={"https://www.tchap.gouv.fr/tchap-prise-en-main.pdf"} rel='noreferrer nofollow noopener' target='_blank'>{_t('User Guide')}</a>
                    </div>
                </aside>
            </div>
        );
    },
});

module.exports = LeftPanel;
