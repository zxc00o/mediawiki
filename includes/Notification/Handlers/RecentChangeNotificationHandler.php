<?php

namespace MediaWiki\Notification\Handlers;

use MediaWiki\Mail\RecentChangeMailComposer;
use MediaWiki\Notification\Notification;
use MediaWiki\Notification\NotificationHandler;
use MediaWiki\Notification\RecipientSet;
use MediaWiki\Title\TitleFactory;
use MediaWiki\User\User;
use MediaWiki\User\UserFactory;
use MediaWiki\Watchlist\RecentChangeNotification;

/**
 * Accept notification events and notify users about them.
 *
 * @since 1.44
 * @unstable
 */
class RecentChangeNotificationHandler implements NotificationHandler {

	private UserFactory $userFactory;
	private TitleFactory $titleFactory;

	public function __construct( UserFactory $userFactory, TitleFactory $titleFactory ) {
		$this->userFactory = $userFactory;
		$this->titleFactory = $titleFactory;
	}

	public function checkNotificationRequirements( Notification $notification, User $user ): bool {
		return $user->isEmailConfirmed();
	}

	/**
	 * Notify users about an event occurring.
	 */
	public function notify( Notification $notification, RecipientSet $recipients ): void {
		if ( !$notification instanceof RecentChangeNotification ) {
			return;
		}
		$properties = $notification->getProperties();

		$composer = new RecentChangeMailComposer(
			$this->userFactory->newFromUserIdentity( $notification->getAgent() ),
			$this->titleFactory->newFromPageIdentity( $notification->getTitle() ),
			$properties['summary'],
			$properties['minorEdit'],
			$properties['oldid'],
			$properties['timestamp'],
			$properties['pageStatus']
		);
		foreach ( $recipients as $recipient ) {
			$user = $this->userFactory->newFromUserIdentity( $recipient );
			if ( $this->checkNotificationRequirements( $notification, $user ) ) {
				// TODO - for now it handles only ALL changes, future patches will provide support
				// for WATCHLIST and USER_TALK
				$composer->compose( $recipient, RecentChangeMailComposer::ALL_CHANGES );
			}
		}
		// TODO - sendEmails is deprecated, remove it in 1.45. need to keep it in parity in case
		// EnotifImpersonal is set - then the previous compose doesn't actually send email
		$composer->sendMails();
	}
}
