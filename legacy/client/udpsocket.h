#ifndef UDPSOCKET_H
#define UDPSOCKET_H
#include <QThread>
#include <QList>
#include <QtNetwork>
#include <QMessageBox>

class udpThread : public QThread
{
    Q_OBJECT
public:
    udpThread();

signals:
    void done();
    void inResult(int);
    void onResult(int);
    void alluser(QList<QString>&);
    void allpoke(QList<QString>&);
    void userGet(QList<QString>&);
    void outResult(QList<QString>&);
private slots:
    void sendIn(QList<QString>& content);
    void sendOn(QList<QString>& content);
    void getUsr(QList<QString>& username);
    void getPoke(QList<QString>& pokelist);
    void initUser(QList<QString>& content);
    void logOut(QList<QString>& content);
    void processPendingDatagram();
    void timeOut();
    void check();
    void handleLvl(QList<QString>& info);
    void addNewPoke(QList<QString>& info);
    void dltMy(QList<QString>& info);
private:
    void bindPort();
    void setTimer();
    QUdpSocket *sender;
    QUdpSocket *receiver;
    quint16 rcv1Port;
    quint16 sendPort;
    QTimer *timer1;
    QTimer *timer2;
    qint32 count = 0;
    qint32 sure = 0;
};
#endif // UDPSOCKET_H
