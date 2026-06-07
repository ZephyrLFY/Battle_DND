#ifndef CHOSECHANGE_H
#define CHOSECHANGE_H

#include <QDialog>
#include <QStandardItemModel>
#include <QtNetwork>
#include <QCloseEvent>

namespace Ui {
class chosechange;
}

class chosechange : public QDialog
{
    Q_OBJECT

public:
    explicit chosechange(QWidget *parent = nullptr);
    ~chosechange();

signals:
    void getUsrPoke(QList<QString>&);
private slots:
    void myTable(QList<QString> &poke);
    void getMyPoke(const QItemSelection&,const QItemSelection&);
    void on_sureBtn_clicked();
    void closeEvent(QCloseEvent *event);
private:
    void getMy();
    Ui::chosechange *ui;
    QStandardItemModel *myPokeModel;
    qint32 rowNum;
    qint32 which;
    bool myChosen = 0;
};

#endif // CHOSECHANGE_H
