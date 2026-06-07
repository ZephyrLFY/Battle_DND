#ifndef USERVIEW_H
#define USERVIEW_H

#include <QDialog>
#include <QStandardItemModel>

namespace Ui {
class userView;
}

class userView : public QDialog
{
    Q_OBJECT

public:
    explicit userView(QWidget *parent = nullptr);
    ~userView();

    void getUsr();

signals:
    void getUsr(QList<QString>&);
public slots:
    void updateTable(QList<QString> &usrInfo);
private:
    Ui::userView *ui;
    QStandardItemModel *usrModel;
    quint16 rcv1Port;
    quint16 sendPort;
    qint32 rowNum;
};

#endif // USERVIEW_H
